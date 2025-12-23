/**
 * API Route: /api/chat/messages
 *
 * POST - Create a new chat message
 * GET - List messages from timeline
 *
 * Uses HAL+JSON for REST Level 3 compliance.
 *
 * @see /architecture/PATTERNS.md
 */

import type { Context } from "fresh";
import type { State } from "@/utils.ts";
import { AppServices } from "@/shared/app-services.ts";
import { ChatMessageService } from "@/features/chat/services/chat-message-service.ts";
import {
  MessageCollectionResponseSchema,
  MessageResponseSchema,
  PostMessageRequestSchema,
} from "@/features/chat/schemas/api-schemas.ts";

export async function handler(ctx: Context<State>): Promise<Response> {
  switch (ctx.req.method) {
    case "POST":
      return await handlePostMessage(ctx);
    case "GET":
      return await handleGetMessages(ctx);
    default:
      return new Response("Method not allowed", { status: 405 });
  }
}

async function handlePostMessage(ctx: Context<State>): Promise<Response> {
  const userPubkey = ctx.state.auth.userPubkey;
  if (!userPubkey) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Validate request
    const body = await ctx.req.json();
    const { content } = PostMessageRequestSchema.parse(body);

    // Create service instance
    const services = AppServices.instance;
    const chatService = new ChatMessageService(
      services.databaseService,
      services.nip46Service,
      services.keepaliveService,
    );

    // Create message
    const event = await chatService.createMessage(content, userPubkey);

    if (!event) {
      return Response.json(
        { error: "Failed to create message" },
        { status: 500 },
      );
    }

    // Build HAL response
    const response = MessageResponseSchema.parse({
      event,
      _links: {
        self: { href: `/api/chat/messages/${event.id}` },
        collection: { href: "/api/chat/messages" },
      },
    });

    return Response.json(response, {
      status: 201,
      headers: { "Content-Type": "application/hal+json" },
    });
  } catch (error) {
    console.error("[POST /api/chat/messages] Error:", error);
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 400 },
    );
  }
}

async function handleGetMessages(ctx: Context<State>): Promise<Response> {
  try {
    const url = new URL(ctx.req.url);
    const limit = Math.min(
      parseInt(url.searchParams.get("limit") ?? "50"),
      100,
    );
    const offset = parseInt(url.searchParams.get("offset") ?? "0");

    // Create service instance
    const services = AppServices.instance;
    const chatService = new ChatMessageService(
      services.databaseService,
      services.nip46Service,
      services.keepaliveService,
    );

    // Retrieve messages and total count in parallel
    const [events, total] = await Promise.all([
      chatService.getRecentMessages(limit, offset),
      chatService.getTotalMessageCount(),
    ]);

    // Build HAL response
    const messages = events.map((event) => ({
      event,
      _links: {
        self: { href: `/api/chat/messages/${event.id}` },
      },
    }));

    const response = MessageCollectionResponseSchema.parse({
      _embedded: { messages },
      _links: {
        self: { href: `/api/chat/messages?limit=${limit}&offset=${offset}` },
        prev: offset > 0
          ? {
            href:
              `/api/chat/messages?limit=${limit}&offset=${Math.max(0, offset - limit)}`,
          }
          : undefined,
        next: offset + limit < total
          ? {
            href:
              `/api/chat/messages?limit=${limit}&offset=${offset + limit}`,
          }
          : undefined,
        create: {
          href: "/api/chat/messages",
          method: "POST",
        },
      },
      total,
      limit,
      offset,
    });

    return Response.json(response, {
      headers: { "Content-Type": "application/hal+json" },
    });
  } catch (error) {
    console.error("[GET /api/chat/messages] Error:", error);
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
