/**
 * Chat feature entry point
 *
 * Registers all chat-related routes and exports services for external use.
 */

import type { App } from "fresh";
import type { State } from "@/utils.ts";
import { chatHandler } from "./routes/index.tsx";
import { handler as messagesHandler } from "./routes/api/messages.ts";
import { handler as messageHandler } from "./routes/api/message.ts";
import { handler as streamHandler } from "./routes/api/stream.ts";

/**
 * Register chat routes
 *
 * AI-NOTE: Access control middleware is applied globally in main.ts
 */
export function registerChatRoutes(app: App<State>): void {
  // UI route (protected by global middleware)
  app.get("/", chatHandler);

  // API routes (protected by global middleware)
  app.all("/api/chat/messages", messagesHandler);
  app.get("/api/chat/messages/stream", streamHandler);
  app.get("/api/chat/messages/:eventId", messageHandler);
}

// Re-export utilities for external use
export { abbreviatePubkey, copyToClipboard } from "./utils/pubkey-utils.ts";
export { formatTimestamp } from "./utils/time-utils.ts";
export type { UIMessage } from "./schemas/message-schema.ts";

// Export service for external use
export { ChatMessageService } from "./services/chat-message-service.ts";
