/**
 * Handshake Monitoring Service
 *
 * Monitors 3rd-party relays for remote signer events that complete client-initiated login flows.
 */

import { generate } from "@std/uuid/unstable-v7";
import { z } from "zod";
import { Noscrypt } from "@/shared/ffi/noscrypt/noscrypt-ffi.ts";
import {
  type NostrEvent,
  NostrEventSchema,
} from "@/shared/nostr/events-schema.ts";
import { type RelayPool } from "@/shared/nostr/relay-pool.ts";
import {
  type HandshakeResult,
  HandshakeResultSchema,
  type Nip46Connection,
  type Nip46Service,
} from "@/features/auth/services/nip46-auth-service.ts";
import { type PendingConnectionData } from "@/features/auth/schemas/pending-connection-schema.ts";

/**
 * NIP-46 event kind for request/response messages.
 */
const NIP46_KIND = 24133;

/**
 * Zod schema for NIP-46 response payload structure.
 */
const Nip46ResponseSchema = z.object({
  id: z.string(),
  result: z.string().optional(),
  error: z.string().optional(),
});
type Nip46Response = z.infer<typeof Nip46ResponseSchema>;

/**
 * Callback function invoked when handshake completes, fails, or times out.
 *
 * @param connectionId - The connection ID
 * @param result - The handshake result (null if timeout or error)
 * @param error - Error if handshake failed
 */
export type HandshakeEventCallback = (
  connectionId: string,
  result: HandshakeResult | null,
  error?: Error,
) => void;

/**
 * Tracks subscription information for an active handshake.
 */
interface SubscriptionInfo {
  connectionId: string;
  relayUrls: string[];
  subIds: Map<string, string>; // relayUrl -> subscriptionId
  callback: HandshakeEventCallback;
  connection: PendingConnectionData["connection"];
}

/**
 * Service for handling NIP-46 handshakes with remote signers over 3rd-party relays.
 */
export class HandshakeService {
  #relayPool: RelayPool;
  #nip46Service: Nip46Service;

  /**
   * A map of user connection IDs to subscriptions on 3rd-party relays.
   */
  #subscriptions: Map<string, SubscriptionInfo> = new Map();

  constructor(nip46Service: Nip46Service, relayPool: RelayPool) {
    this.#nip46Service = nip46Service;
    this.#relayPool = relayPool;
  }

  /**
   * Subscribe to relays and listen for NIP-46 connection events.
   *
   * @param connectionId - Unique connection identifier
   * @param pendingData - Pending connection data
   * @param callback - Callback invoked when handshake completes or errors
   */
  async startHandshake(
    connectionId: string,
    pendingData: PendingConnectionData,
    callback: HandshakeEventCallback,
  ): Promise<void> {
    // AI-NOTE: Prevent duplicate subscriptions for same connectionId
    if (this.#subscriptions.has(connectionId)) {
      console.warn(
        `[handshake-service] Handshake already in progress for ${connectionId}`,
      );
      return;
    }

    const { connection } = pendingData;
    const { clientPubkey, relayUrls } = connection;

    // Create subscription info
    const subInfo: SubscriptionInfo = {
      connectionId,
      relayUrls,
      subIds: new Map(),
      callback,
      connection,
    };

    // Subscribe to each relay
    for (const relayUrl of relayUrls) {
      try {
        // Create relay event handler bound to this connectionId
        const eventHandler = this.#createEventHandler(connectionId);

        // Subscribe to NIP-46 events for this client pubkey
        const subId = await this.#relayPool.subscribe(
          relayUrl,
          [{ kinds: [NIP46_KIND], "#p": [clientPubkey] }],
          eventHandler,
        );

        subInfo.subIds.set(relayUrl, subId);
      } catch (error) {
        console.error(
          `[handshake-service] Failed to subscribe to ${relayUrl}:`,
          error,
        );
        // AI-NOTE: Continue with other relays even if one fails
      }
    }

    // AI-NOTE: If all relays failed to subscribe, invoke error callback
    if (subInfo.subIds.size === 0) {
      callback(
        connectionId,
        null,
        new Error("Failed to subscribe to any relay"),
      );
      return;
    }

    // Store subscription info
    this.#subscriptions.set(connectionId, subInfo);
  }

  /**
   * Cancel a handshake and clean up its subscriptions.
   * Called when client disconnects SSE stream.
   *
   * @param connectionId - The connection ID to cancel
   */
  cancelHandshake(connectionId: string): void {
    this.#cleanupSubscriptions(connectionId);
  }

  /**
   * Creates an event handler for relay events bound to a specific connectionId.
   */
  #createEventHandler(connectionId: string): (event: NostrEvent) => void {
    return (event: NostrEvent) => {
      this.#handleRelayEvent(connectionId, event);
    };
  }

  /**
   * Handles incoming relay events for a handshake.
   *
   * @param connectionId - The connection ID
   * @param event - The Nostr event from the relay
   */
  async #handleRelayEvent(
    connectionId: string,
    event: NostrEvent,
  ): Promise<void> {
    const subInfo = this.#subscriptions.get(connectionId);
    if (!subInfo) {
      // AI-NOTE: Subscription already cleaned up, ignore event
      return;
    }

    try {
      // Validate event
      const ev = NostrEventSchema.parse(event);
      if (ev.kind !== NIP46_KIND) {
        return;
      }

      // Decrypt the message
      using noscrypt = new Noscrypt();
      const decrypted = noscrypt.decryptNip44(
        subInfo.connection.clientSecretKey,
        ev.pubkey,
        ev.content,
      );

      const response = Nip46ResponseSchema.parse(decrypted);

      // AI-NOTE: Validate that the response contains the expected secret
      const { secret } = subInfo.connection;
      if (
        response.result === secret ||
        (secret && response.result?.includes(secret))
      ) {
        // Build complete connection
        const connection: Nip46Connection = {
          clientSecretKey: subInfo.connection.clientSecretKey,
          clientPubkey: subInfo.connection.clientPubkey,
          signerPubkey: event.pubkey,
          relayUrls: subInfo.relayUrls,
          secret: subInfo.connection.secret,
        };

        // Get user's actual public key via NIP-46 request
        const response = await this.#nip46Service.sendRemoteSignerRequest(
          connection,
          {
            id: generate(),
            method: "get_public_key",
            params: [],
          },
        );

        if (response.error) {
          throw new Error(`Failed to get public key: ${response.error}`);
        }

        if (!response.result) {
          throw new Error("No public key in response");
        }

        const userPubkey = response.result;

        // Build and validate result
        const res = HandshakeResultSchema.parse({
          userPubkey,
          connection,
        });

        // Clean up before invoking callback
        const callback = subInfo.callback;
        this.#cleanupSubscriptions(connectionId);

        // Invoke callback with result
        callback(connectionId, res);
      } else {
        // AI-NOTE: Invalid secret - log and continue waiting
        console.warn(
          `[handshake-service] Invalid secret in response for ${connectionId}`,
        );
      }
    } catch (error) {
      console.error(
        `[handshake-service] Error processing event for ${connectionId}:`,
        error,
      );
      // AI-NOTE: Don't invoke error callback for invalid events - just log and continue
      // Cleanup happens when client disconnects
    }
  }

  /**
   * Cleans up subscriptions for a connection.
   *
   * @param connectionId - The connection ID
   */
  #cleanupSubscriptions(connectionId: string): void {
    const subInfo = this.#subscriptions.get(connectionId);
    if (!subInfo) {
      return;
    }

    // Unsubscribe from all relays
    for (const [relayUrl, subId] of subInfo.subIds) {
      try {
        this.#relayPool.unsubscribe(relayUrl, subId);
      } catch (error) {
        console.error(
          `[handshake-service] Failed to unsubscribe from ${relayUrl}:`,
          error,
        );
      }
    }

    // Remove from tracking
    this.#subscriptions.delete(connectionId);
  }
}

/**
 * Factory function to create a HandshakeService instance.
 *
 * @param nip46Service - The NIP-46 service instance
 * @param relayPool - The relay pool instance
 * @returns A new HandshakeService instance
 */
export function createHandshakeService(
  nip46Service: Nip46Service,
  relayPool: RelayPool,
): HandshakeService {
  return new HandshakeService(nip46Service, relayPool);
}
