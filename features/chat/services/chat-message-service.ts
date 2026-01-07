/**
 * Chat Message Service
 *
 * Business logic layer for chat message operations.
 * Coordinates NIP-46 remote signing, signature validation, and database storage.
 *
 * @see /architecture/PATTERNS.md
 */

import { ChatMessage } from "@/shared/nostr/events-schema.ts";
import { NostrEventBaseSchema } from "@/shared/nostr/events-schema.ts";
import { verifyEventSignature } from "@/shared/nostr/crypto.ts";
import {
  getTimelineMessageCount,
  getTimelineMessages,
  publishNewMessage,
  storeTimelineMessage,
} from "@/shared/transactions/chat-messages.ts";
import type { DatabaseService } from "@/shared/database/database-service.ts";
import type { Nip46Service } from "@/features/auth/services/nip46-auth-service.ts";
import type { KeepaliveService } from "@/features/auth/services/keepalive-service.ts";

/**
 * Chat message service for creating and retrieving messages.
 */
export class ChatMessageService {
  #databaseService: DatabaseService;
  #nip46Service: Nip46Service;
  #keepaliveService: KeepaliveService;

  constructor(
    databaseService: DatabaseService,
    nip46Service: Nip46Service,
    keepaliveService: KeepaliveService,
  ) {
    this.#databaseService = databaseService;
    this.#nip46Service = nip46Service;
    this.#keepaliveService = keepaliveService;
  }

  /**
   * Creates a new chat message.
   *
   * @param content - The message content
   * @param userPubkey - The user's public key
   * @returns The created chat message, or null if creation failed
   */
  async createMessage(
    content: string,
    userPubkey: string,
  ): Promise<ChatMessage | null> {
    // 1. Get NIP-46 connection from keepalive service
    const connection = this.#keepaliveService.getConnection(userPubkey);
    if (!connection) {
      console.error("No active connection for user", userPubkey);
      return null;
    }

    // 2. Build unsigned kind 11 event
    const baseEvent = NostrEventBaseSchema.parse({
      pubkey: userPubkey,
      created_at: Math.floor(Date.now() / 1000),
      kind: 11,
      tags: [],
      content,
    });

    // 3. Request remote signing via NIP-46
    let signedEvent;
    try {
      signedEvent = await this.#nip46Service.requestSignEvent(
        connection,
        baseEvent,
      );
    } catch (error) {
      console.error("Failed to sign message:", error);
      return null;
    }

    // 4. Verify signature with noscrypt and parse as ChatMessage
    const isValid = await verifyEventSignature(signedEvent);
    if (!isValid) {
      console.error("Invalid event signature for message");
      return null;
    }

    const chatMessage = ChatMessage.parse(signedEvent);

    // 5. Store in Valkey via transaction script
    await storeTimelineMessage(this.#databaseService, chatMessage);

    // 6. Publish to SSE channel
    await publishNewMessage(this.#databaseService, chatMessage.id);

    return chatMessage;
  }

  /**
   * Retrieves a single message by ID.
   *
   * @param eventId - The message event ID
   * @returns The message, or null if not found
   */
  async getMessage(eventId: string): Promise<ChatMessage | null> {
    const key = `chat.message.${eventId}`;
    const hash = await this.#databaseService.getHash(key);

    if (!hash) {
      return null;
    }

    try {
      // Parse and validate
      const message = ChatMessage.parse({
        id: hash.id,
        pubkey: hash.pubkey,
        created_at: parseInt(hash.created_at),
        kind: parseInt(hash.kind),
        tags: JSON.parse(hash.tags),
        content: hash.content,
        sig: hash.sig,
      });

      // Verify signature
      const isValid = await verifyEventSignature(message);
      if (!isValid) {
        console.error(`Invalid signature for message ${eventId}`);
        return null;
      }

      return message;
    } catch (error) {
      console.error(`Failed to parse message ${eventId}:`, error);
      return null;
    }
  }

  /**
   * Retrieves recent messages from the timeline.
   *
   * @param limit - Maximum number of messages to retrieve (default: 50)
   * @param offset - Offset for pagination (default: 0)
   * @returns Array of chat messages
   */
  async getRecentMessages(
    limit: number = 50,
    offset: number = 0,
  ): Promise<ChatMessage[]> {
    // Use transaction script to retrieve timeline messages
    return await getTimelineMessages(
      this.#databaseService,
      offset,
      limit,
    );
  }

  /**
   * Gets the total count of messages in the timeline.
   *
   * @returns Total number of messages
   */
  async getTotalMessageCount(): Promise<number> {
    // Get total count from sorted set (O(1) operation)
    return await getTimelineMessageCount(this.#databaseService);
  }
}
