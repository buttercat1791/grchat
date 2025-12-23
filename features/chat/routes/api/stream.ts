/**
 * API Route: GET /api/chat/messages/stream
 *
 * Server-Sent Events (SSE) endpoint for real-time message delivery.
 * Subscribes to Valkey pub/sub channel and streams new messages to connected clients.
 *
 * @see /architecture/PATTERNS.md
 */

import type { Context } from "fresh";
import type { State } from "@/utils.ts";
import { AppServices } from "@/shared/app-services.ts";
import { getTimelineMessages } from "@/shared/transactions/chat-messages.ts";

export async function handler(ctx: Context<State>): Promise<Response> {
  const userPubkey = ctx.state.auth.userPubkey;
  if (!userPubkey) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const encoder = new TextEncoder();
  let subscribed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const db = AppServices.instance.databaseService;

      try {
        // Subscribe to Valkey pub/sub channel
        await db.subscribe("chat.messages.new", async (messageId) => {
          try {
            // Retrieve the new message
            const messages = await getTimelineMessages(db, 0, 100);
            const message = messages.find((m) => m.id === messageId);

            if (message) {
              // Send SSE event
              const data = JSON.stringify({ event: message });
              const sseMessage = `data: ${data}\n\n`;
              controller.enqueue(encoder.encode(sseMessage));
            }
          } catch (error) {
            console.error("Error processing SSE message:", error);
          }
        });

        subscribed = true;

        // Send initial keepalive comment
        controller.enqueue(encoder.encode(": keepalive\n\n"));
      } catch (error) {
        console.error("Error setting up SSE stream:", error);
        controller.error(error);
      }
    },
    async cancel() {
      // Cleanup on disconnect
      if (subscribed) {
        try {
          const db = AppServices.instance.databaseService;
          await db.unsubscribe("chat.messages.new");
        } catch (error) {
          console.error("Error unsubscribing from channel:", error);
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
