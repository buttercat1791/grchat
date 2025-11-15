/**
 * Nostr Event Type Definitions
 *
 * Defines Zod schemas for Nostr events according to NIP-01 and NIP-7D.
 *
 * @see https://github.com/nostr-protocol/nips/blob/master/01.md
 * @see https://github.com/nostr-protocol/nips/blob/master/7D.md
 */
import z from "zod";

/**
 * Unsigned Nostr event (before signing).
 *
 * This represents an event that has been created but not yet signed.
 * The ID and signature fields are absent.
 */
export const NostrEventBase = z.object({
  /** Public key of the event creator (32-byte lowercase hex string) */
  pubkey: z.hex().length(64),

  /** Unix timestamp in seconds */
  created_at: z.int().positive(),

  /** Event kind k such that 0 <= k < 40000 */
  kind: z.int().positive().lt(40000),

  /** Array of tags, where each tag is an array of strings */
  tags: z.array(z.array(z.string())),

  /** Arbitrary string content */
  content: z.string(),
});

export const NostrEvent = NostrEventBase.safeExtend({
  /** SHA-256 hash of the serialized event (32-byte lowercase hex string) */
  id: z.hash("sha256").length(64),

  /** Schnorr signature of the event ID (64-byte lowercase hex string) */
  sig: z.hex().length(128),
});

/**
 * Serialized event data for over which the event ID and signature are generated.
 */
export const signatureData = z.tuple([
  z.literal(0), // integer 0 prefix
  z.hex().length(64), // pubkey
  z.int().positive(), // created_at
  z.int().positive().lt(40000), // kind
  z.array(z.array(z.string())), // tags
  z.string(), // content
]);

/**
 * NIP-7D chat message (kind 11).
 */
export const ChatMessage = NostrEvent.extend({
  kind: z.literal(11),
});

/**
 * NIP-7D threaded response (kind 1111).
 *
 * Responses to a root chat message (kind 11).
 * Must include an "e" tag referencing the root message ID.
 */
export const ThreadedResponse = NostrEvent.extend({
  kind: z.literal(1111),
  tags: z.array(z.array(z.string())).refine((tags) =>
    tags.some((tag) =>
      tag[0] === "e" &&
      tag.length >= 2 &&
      tag.length <= 4
    )
  ),
});
