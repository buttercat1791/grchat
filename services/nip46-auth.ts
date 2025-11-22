/**
 * NIP-46 Remote Signing Service
 *
 * Implements the NIP-46 protocol for authenticating users via remote signers.
 * Handles both client-initiated (nostrconnect://) and signer-initiated (bunker://)
 * connection flows.
 *
 * @see https://github.com/nostr-protocol/nips/blob/master/46.md
 */

import { z } from "zod";
import { Noscrypt } from "@/libraries/noscrypt/noscrypt-ffi.ts";
import { NID, NostrEvent, NostrEventBase } from "@/schemas/nostr-events.ts";
import { RelayError, RelayPool } from "./relay-pool.ts";
import { signEvent } from "./nostr/crypto.ts";

/**
 * Error thrown when NIP-46 operations fail.
 */
export class Nip46Error extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "Nip46Error";
  }
}

/**
 * NIP-46 request payload structure.
 */
interface Nip46Request {
  id: string;
  method: string;
  params: string[];
}

/**
 * NIP-46 response payload structure.
 */
interface Nip46Response {
  id: string;
  result?: string;
  error?: string;
}

/**
 * Connection state for NIP-46 communication.
 */
export interface Nip46Connection {
  /** Ephemeral secret key for this connection session */
  clientSecretKey: string;
  /** Ephemeral public key derived from clientSecretKey */
  clientPubkey: string;
  /** Public key of the remote signer application */
  signerPubkey: string;
  /** Relay URLs where the signer is listening */
  relayUrls: string[];
  /** Optional handshake secret for verification */
  secret?: string;
}

/**
 * Result of generating a nostrconnect:// URL.
 */
export interface NostrconnectResult {
  /** The nostrconnect:// URL to present to the user */
  url: string;
  /** The connection state to use for completing the handshake */
  connection: Omit<Nip46Connection, "signerPubkey">;
}

/**
 * Application metadata for nostrconnect:// URLs.
 */
export interface AppMetadata {
  /** Application name */
  name?: string;
  /** Application URL */
  url?: string;
  /** Application icon URL */
  image?: string;
  /** Requested permissions (comma-separated) */
  perms?: string;
}

/**
 * Result of completing a NIP-46 handshake.
 */
export interface HandshakeResult {
  /** The user's actual public key (identity) */
  userPubkey: string;
  /** The complete connection state */
  connection: Nip46Connection;
}

/**
 * NIP-46 event kind for request/response messages.
 */
const NIP46_KIND = 24133;

/**
 * Default timeout for NIP-46 operations in milliseconds.
 */
const DEFAULT_TIMEOUT = 30000;

/**
 * NIP-46 Remote Signing Service.
 *
 * Provides authentication via remote signers following the NIP-46 protocol.
 *
 * @example Client-initiated flow (nostrconnect://)
 * ```ts
 * const service = new Nip46Service(relayPool);
 *
 * // Generate URL for user to scan
 * const { url, connection } = service.generateNostrconnectUrl(
 *   ["wss://relay.example.com"],
 *   { name: "My App" }
 * );
 *
 * // Wait for signer response and complete handshake
 * const result = await service.awaitHandshake(connection);
 * console.log("User pubkey:", result.userPubkey);
 * ```
 *
 * @example Signer-initiated flow (bunker://)
 * ```ts
 * const service = new Nip46Service(relayPool);
 *
 * // Parse bunker URL from user
 * const connection = service.parseBunkerUrl(bunkerUrl);
 *
 * // Complete handshake
 * const result = await service.completeHandshake(connection);
 * console.log("User pubkey:", result.userPubkey);
 * ```
 */
export class Nip46Service {
  private relayPool: RelayPool;
  private pendingRequests: Map<string, {
    resolve: (response: Nip46Response) => void;
    reject: (error: Error) => void;
    timeout: number;
  }> = new Map();

  constructor(relayPool: RelayPool) {
    this.relayPool = relayPool;
  }

  /**
   * Generates a nostrconnect:// URL for client-initiated connections.
   *
   * @param relayUrls - Relay URLs where grchat will listen for the signer's response
   * @param metadata - Optional application metadata
   * @returns The URL and connection state
   */
  generateNostrconnectUrl(
    relayUrls: string[],
    metadata?: AppMetadata,
  ): NostrconnectResult {
    if (relayUrls.length === 0) {
      throw new Nip46Error("At least one relay URL is required");
    }

    // Generate ephemeral keypair for this connection
    using noscrypt = new Noscrypt();
    const { secretKey, publicKey } = noscrypt.generateKeypair();

    // Generate random secret for handshake verification
    const secretBytes = new Uint8Array(16);
    crypto.getRandomValues(secretBytes);
    const secret = Array.from(secretBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Build nostrconnect:// URL
    const params = new URLSearchParams();
    for (const relay of relayUrls) {
      params.append("relay", relay);
    }
    params.append("secret", secret);

    if (metadata?.name) params.append("name", metadata.name);
    if (metadata?.url) params.append("url", metadata.url);
    if (metadata?.image) params.append("image", metadata.image);
    if (metadata?.perms) params.append("perms", metadata.perms);

    const url = `nostrconnect://${publicKey}?${params.toString()}`;

    return {
      url,
      connection: {
        clientSecretKey: secretKey,
        clientPubkey: publicKey,
        relayUrls,
        secret,
      },
    };
  }

  /**
   * Parses a bunker:// URL for signer-initiated connections.
   *
   * @param bunkerUrl - The bunker:// URL provided by the user
   * @returns The connection state
   *
   * @throws {Nip46Error} If the URL is invalid
   */
  parseBunkerUrl(bunkerUrl: string): Nip46Connection {
    if (!bunkerUrl.startsWith("bunker://")) {
      throw new Nip46Error("Invalid bunker URL: must start with bunker://");
    }

    // Parse URL
    const urlPart = bunkerUrl.slice(9); // Remove "bunker://"
    const [signerPubkey, queryString] = urlPart.split("?");

    // Validate signer pubkey
    try {
      NID.parse(signerPubkey);
    } catch {
      throw new Nip46Error("Invalid bunker URL: invalid signer public key");
    }

    // Parse query parameters
    const params = new URLSearchParams(queryString || "");
    const relayUrls = params.getAll("relay");

    if (relayUrls.length === 0) {
      throw new Nip46Error(
        "Invalid bunker URL: at least one relay is required",
      );
    }

    const secret = params.get("secret") || undefined;

    // Generate ephemeral keypair for this connection
    using noscrypt = new Noscrypt();
    const { secretKey, publicKey } = noscrypt.generateKeypair();

    return {
      clientSecretKey: secretKey,
      clientPubkey: publicKey,
      signerPubkey,
      relayUrls,
      secret,
    };
  }

  /**
   * Awaits a signer's response to a nostrconnect:// URL.
   *
   * @param partialConnection - The connection state from generateNostrconnectUrl
   * @param timeout - Timeout in milliseconds (default: 30s)
   * @returns The completed handshake result
   *
   * @throws {Nip46Error} If the handshake times out or fails
   */
  async awaitHandshake(
    partialConnection: Omit<Nip46Connection, "signerPubkey">,
    timeout: number = DEFAULT_TIMEOUT,
  ): Promise<HandshakeResult> {
    const { clientSecretKey, clientPubkey, relayUrls, secret } =
      partialConnection;

    // Connect to relays and subscribe for responses
    for (const relay of relayUrls) {
      await this.relayPool.connect(relay);
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        for (const relay of relayUrls) {
          this.relayPool.unsubscribe(relay, subId);
        }
        reject(new Nip46Error("Handshake timed out"));
      }, timeout);

      let subId: string;

      // Subscribe to all relays for NIP-46 messages tagged to our pubkey
      const handleEvent = async (event: z.infer<typeof NostrEvent>) => {
        if (event.kind !== NIP46_KIND) return;

        try {
          // Decrypt the message
          using noscrypt = new Noscrypt();
          const decrypted = noscrypt.decryptNip44(
            clientSecretKey,
            event.pubkey,
            event.content,
          );

          const response = JSON.parse(decrypted) as Nip46Response;

          // Check if this is a connect response with our secret
          if (
            response.result === secret ||
            (secret && response.result?.includes(secret))
          ) {
            clearTimeout(timeoutId);

            // Complete the connection
            const connection: Nip46Connection = {
              clientSecretKey,
              clientPubkey,
              signerPubkey: event.pubkey,
              relayUrls,
              secret,
            };

            // Get the user's actual public key
            const userPubkey = await this.getUserPublicKey(connection);

            for (const relay of relayUrls) {
              this.relayPool.unsubscribe(relay, subId);
            }

            resolve({
              userPubkey,
              connection,
            });
          }
        } catch {
          // Ignore decryption failures - may be from other parties
        }
      };

      // Subscribe on first relay (NIP-46 typically uses single relay)
      this.relayPool
        .subscribe(relayUrls[0], [{
          kinds: [NIP46_KIND],
          "#p": [clientPubkey],
        }], handleEvent)
        .then((id) => {
          subId = id;
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(
            new Nip46Error("Failed to subscribe for handshake", {
              cause: error,
            }),
          );
        });
    });
  }

  /**
   * Completes the handshake for a bunker:// connection.
   *
   * @param connection - The connection state from parseBunkerUrl
   * @returns The completed handshake result
   *
   * @throws {Nip46Error} If the handshake fails
   */
  async completeHandshake(
    connection: Nip46Connection,
  ): Promise<HandshakeResult> {
    // If there's a secret, we need to send a connect acknowledgment first
    if (connection.secret) {
      await this.sendRequest(connection, {
        id: crypto.randomUUID(),
        method: "connect",
        params: [connection.clientPubkey, connection.secret],
      });
    }

    // Get the user's actual public key
    const userPubkey = await this.getUserPublicKey(connection);

    return {
      userPubkey,
      connection,
    };
  }

  /**
   * Gets the user's public key from the remote signer.
   *
   * @param connection - The NIP-46 connection
   * @returns The user's public key
   */
  private async getUserPublicKey(connection: Nip46Connection): Promise<string> {
    const response = await this.sendRequest(connection, {
      id: crypto.randomUUID(),
      method: "get_public_key",
      params: [],
    });

    if (response.error) {
      throw new Nip46Error(`Failed to get public key: ${response.error}`);
    }

    if (!response.result) {
      throw new Nip46Error("No public key in response");
    }

    // Validate the public key format
    try {
      NID.parse(response.result);
    } catch {
      throw new Nip46Error("Invalid public key format in response");
    }

    return response.result;
  }

  /**
   * Sends a NIP-46 request to the remote signer.
   *
   * @param connection - The NIP-46 connection
   * @param request - The request payload
   * @param timeout - Timeout in milliseconds
   * @returns The response from the signer
   */
  async sendRequest(
    connection: Nip46Connection,
    request: Nip46Request,
    timeout: number = DEFAULT_TIMEOUT,
  ): Promise<Nip46Response> {
    // Encrypt the request payload
    using noscrypt = new Noscrypt();
    const payload = JSON.stringify(request);
    const encrypted = noscrypt.encryptNip44(
      connection.clientSecretKey,
      connection.signerPubkey,
      payload,
    );

    // Create the NIP-46 event
    const eventBase: z.infer<typeof NostrEventBase> = {
      pubkey: connection.clientPubkey,
      created_at: Math.floor(Date.now() / 1000),
      kind: NIP46_KIND,
      tags: [["p", connection.signerPubkey]],
      content: encrypted,
    };

    // Sign the event
    const signedEvent = await signEvent(eventBase, connection.clientSecretKey);

    // Set up response handler
    const responsePromise = new Promise<Nip46Response>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(request.id);
        reject(new Nip46Error(`Request ${request.method} timed out`));
      }, timeout);

      this.pendingRequests.set(request.id, {
        resolve,
        reject,
        timeout: timeoutId,
      });
    });

    // Subscribe for response
    const handleResponse = (event: z.infer<typeof NostrEvent>) => {
      if (event.kind !== NIP46_KIND) return;
      if (event.pubkey !== connection.signerPubkey) return;

      try {
        using nc = new Noscrypt();
        const decrypted = nc.decryptNip44(
          connection.clientSecretKey,
          event.pubkey,
          event.content,
        );

        const response = JSON.parse(decrypted) as Nip46Response;

        const pending = this.pendingRequests.get(response.id);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingRequests.delete(response.id);
          pending.resolve(response);
        }
      } catch {
        // Ignore decryption failures
      }
    };

    // Subscribe on first relay
    const subId = await this.relayPool.subscribe(
      connection.relayUrls[0],
      [{ kinds: [NIP46_KIND], "#p": [connection.clientPubkey] }],
      handleResponse,
    );

    try {
      // Publish the request
      await this.relayPool.publish(connection.relayUrls[0], signedEvent);

      // Wait for response
      return await responsePromise;
    } finally {
      this.relayPool.unsubscribe(connection.relayUrls[0], subId);
    }
  }

  /**
   * Sends a ping to the remote signer.
   *
   * @param connection - The NIP-46 connection
   * @param timeout - Timeout in milliseconds
   * @returns True if pong received, false otherwise
   */
  async ping(
    connection: Nip46Connection,
    timeout: number = 10000,
  ): Promise<boolean> {
    try {
      const response = await this.sendRequest(
        connection,
        {
          id: crypto.randomUUID(),
          method: "ping",
          params: [],
        },
        timeout,
      );

      return response.result === "pong";
    } catch {
      return false;
    }
  }

  /**
   * Requests the remote signer to sign an event.
   *
   * @param connection - The NIP-46 connection
   * @param event - The unsigned event to sign
   * @returns The signed event
   */
  async requestSignEvent(
    connection: Nip46Connection,
    event: z.infer<typeof NostrEventBase>,
  ): Promise<z.infer<typeof NostrEvent>> {
    const response = await this.sendRequest(connection, {
      id: crypto.randomUUID(),
      method: "sign_event",
      params: [JSON.stringify(event)],
    });

    if (response.error) {
      throw new Nip46Error(`Failed to sign event: ${response.error}`);
    }

    if (!response.result) {
      throw new Nip46Error("No signed event in response");
    }

    const signedEvent = JSON.parse(response.result);
    return NostrEvent.parse(signedEvent);
  }
}

/**
 * Creates a new NIP-46 service instance.
 *
 * @param relayPool - The relay pool to use for communication
 * @returns A new Nip46Service instance
 */
export function createNip46Service(relayPool: RelayPool): Nip46Service {
  return new Nip46Service(relayPool);
}
