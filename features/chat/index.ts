/**
 * Chat feature entry point
 *
 * Registers the root chat interface route
 */

import type { App } from "fresh";
import type { State } from "@/utils.ts";
import { chatHandler } from "./routes/index.tsx";

/**
 * Register chat routes
 */
export function registerChatRoutes(app: App<State>): void {
  app.get("/", chatHandler);
}

// Re-export utilities for external use
export { abbreviatePubkey, copyToClipboard } from "./utils/pubkey-utils.ts";
export { formatTimestamp } from "./utils/time-utils.ts";
export type { Message } from "./schemas/message-schema.ts";
