/**
 * Message schema for chat UI
 *
 * Wraps ChatMessage events from the backend with UI-specific metadata.
 */

import type { ChatMessage } from "@/shared/nostr/events-schema.ts";

/**
 * UI-specific message type that combines a Nostr ChatMessage event
 * with metadata needed for display.
 */
export type UIMessage = {
  event: ChatMessage;
  isOwnMessage: boolean;
};
