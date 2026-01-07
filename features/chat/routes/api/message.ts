/**
 * API Route: GET /api/chat/messages/:eventId
 *
 * Retrieves a single chat message by its event ID.
 *
 * Uses HAL+JSON for REST Level 3 compliance.
 *
 * @see /architecture/PATTERNS.md
 */

import type { Context } from "fresh";
import type { State } from "@/utils.ts";
import { AppServices } from "@/shared/app-services.ts";
import { ChatMessageService } from "@/features/chat/services/chat-message-service.ts";
import { MessageResponseSchema } from "@/features/chat/schemas/api-schemas.ts";

export async function handler(ctx: Context<State>): Promise<Response> {
  try {
    const eventId = ctx.params.eventId;

    if (!eventId) {
      return Response.json({ error: "Event ID is required" }, { status: 400 });
    }

    const services = AppServices.instance;
    const chatService = new ChatMessageService(
      services.databaseService,
      services.nip46Service,
      services.keepaliveService,
    );

    const event = await chatService.getMessage(eventId);
    if (!event) {
      return Response.json({ error: "Message not found" }, { status: 404 });
    }

    const response = MessageResponseSchema.parse({
      event,
      _links: {
        self: { href: `/api/chat/messages/${event.id}` },
        collection: { href: "/api/chat/messages" },
      },
    });

    return Response.json(response, {
      headers: { "Content-Type": "application/hal+json" },
    });
  } catch (error) {
    console.error("[GET /api/chat/messages/:eventId] Error:", error);
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
