import { z } from "zod";

/**
 * Message schema for chat UI
 *
 * AI-NOTE: This is a client-side-only schema for the mock chat UI.
 * Future backend integration will require alignment with NIP-7D event schema.
 * Messages are stored as Nostr events on the backend, which have their own
 * event IDs - hence no ID field in this schema.
 */
export const MessageSchema = z.object({
  text: z.string().min(1),
  senderPubkey: z.string(),
  timestamp: z.number(),
  isOwnMessage: z.boolean(),
});

export type Message = z.infer<typeof MessageSchema>;
