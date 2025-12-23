/**
 * Chat API Schema Definitions
 *
 * Defines Zod schemas for chat API request/response validation.
 * Uses HAL+JSON (Hypertext Application Language) for REST Level 3 compliance.
 *
 * @see https://datatracker.ietf.org/doc/html/draft-kelly-json-hal-08
 */
import { z } from "zod";
import { ChatMessage } from "@/shared/nostr/events-schema.ts";

/**
 * POST /api/chat/messages request body schema.
 *
 * Validates the content field for creating a new chat message.
 */
export const PostMessageRequestSchema = z.object({
  content: z.string().min(1).max(10000),
});

export type PostMessageRequest = z.infer<typeof PostMessageRequestSchema>;

/**
 * Single message response with HAL links.
 *
 * Represents a single chat message resource with hypermedia controls.
 */
export const MessageResponseSchema = z.object({
  event: ChatMessage,
  _links: z.object({
    self: z.object({ href: z.string() }),
    collection: z.object({ href: z.string() }).optional(),
  }),
});

export type MessageResponse = z.infer<typeof MessageResponseSchema>;

/**
 * Message collection response with HAL links.
 *
 * Represents a paginated collection of chat messages with hypermedia controls
 * for navigation (prev/next) and actions (create).
 */
export const MessageCollectionResponseSchema = z.object({
  _embedded: z.object({
    messages: z.array(MessageResponseSchema),
  }),
  _links: z.object({
    self: z.object({ href: z.string() }),
    prev: z.object({ href: z.string() }).optional(),
    next: z.object({ href: z.string() }).optional(),
    create: z.object({
      href: z.string(),
      method: z.literal("POST"),
    }),
  }),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});

export type MessageCollectionResponse = z.infer<
  typeof MessageCollectionResponseSchema
>;
