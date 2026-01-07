/**
 * Chat Messages Transaction Scripts
 *
 * Database transaction scripts for chat message operations following the
 * DRY principle and vertical slice architecture pattern.
 *
 * @see /architecture/DATABASE_SCHEMA.md
 * @see /architecture/PATTERNS.md
 */

import { ChatMessage } from "@/shared/nostr/events-schema.ts";
import { verifyEventSignature } from "@/shared/nostr/crypto.ts";
import type { DatabaseService } from "@/shared/database/database-service.ts";

const MESSAGE_KEY_PREFIX = "chat.message.";
const TIMELINE_INDEX_KEY = "index.messages.timeline";
const MESSAGE_TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days

/**
 * Stores a chat message in the database with timeline indexing.
 *
 * Transaction script that:
 * 1. Stores message as hash with TTL
 * 2. Adds message ID to timeline sorted set
 * 3. Sets TTL on timeline index
 *
 * @param db - Database service instance
 * @param message - Chat message to store
 */
export async function storeTimelineMessage(
  db: DatabaseService,
  message: ChatMessage,
): Promise<void> {
  const key = `${MESSAGE_KEY_PREFIX}${message.id}`;

  // Store message as hash
  await db.setHashWithTTL(
    key,
    {
      id: message.id,
      pubkey: message.pubkey,
      created_at: message.created_at.toString(),
      kind: message.kind.toString(),
      tags: JSON.stringify(message.tags),
      content: message.content,
      sig: message.sig,
    },
    MESSAGE_TTL_SECONDS,
  );

  // Add to timeline index
  await db.sortedSetAdd(TIMELINE_INDEX_KEY, [
    { member: message.id, score: message.created_at },
  ]);

  // Set TTL on index
  await db.setTTL(TIMELINE_INDEX_KEY, MESSAGE_TTL_SECONDS);
}

/**
 * Retrieves chat messages from the timeline in chronological order.
 *
 * Transaction script that:
 * 1. Queries timeline sorted set for message IDs
 * 2. Retrieves each message hash
 * 3. Validates signatures
 * 4. Returns validated ChatMessage events
 *
 * @param db - Database service instance
 * @param offset - Offset for pagination
 * @param limit - Maximum number of messages to retrieve
 * @returns Array of validated chat messages
 */
export async function getTimelineMessages(
  db: DatabaseService,
  offset: number,
  limit: number,
): Promise<ChatMessage[]> {
  // Get event IDs from timeline index (newest first)
  const eventIds = await db.sortedSetRange(
    TIMELINE_INDEX_KEY,
    offset,
    offset + limit - 1,
    { reverse: true },
  ) as string[];

  if (!eventIds || eventIds.length === 0) {
    return [];
  }

  // Retrieve and validate messages
  const messages: ChatMessage[] = [];
  for (const eventId of eventIds) {
    const key = `${MESSAGE_KEY_PREFIX}${eventId}`;
    const hash = await db.getHash(key);

    if (!hash) {
      continue;
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
      if (isValid) {
        messages.push(message);
      } else {
        console.error(`Invalid signature for message ${eventId}`);
      }
    } catch (error) {
      console.error(`Failed to parse message ${eventId}:`, error);
    }
  }

  return messages;
}

/**
 * Gets the total count of messages in the timeline.
 *
 * Uses Valkey's ZCARD command to get the cardinality (count) of the
 * sorted set without loading all message IDs into memory.
 *
 * @param db - Database service instance
 * @returns Total number of messages in timeline
 */
export async function getTimelineMessageCount(
  db: DatabaseService,
): Promise<number> {
  return await db.sortedSetCard(TIMELINE_INDEX_KEY);
}

/**
 * Publishes a new message ID to the SSE pub/sub channel.
 *
 * @param db - Database service instance
 * @param messageId - Message event ID to publish
 */
export async function publishNewMessage(
  db: DatabaseService,
  messageId: string,
): Promise<void> {
  await db.publish("chat.messages.new", messageId);
}
