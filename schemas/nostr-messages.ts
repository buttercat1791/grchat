import z from "zod";
import { NostrEventSchema } from "./nostr-events.ts";

/**
 * NIP-01 filter for subscription requests.
 *
 * AI-NOTE: Uses passthrough() to allow arbitrary tag filters (#e, #p, etc.)
 * without constraining their types. Tag filters are string arrays, but
 * catchall() would conflict with the explicitly typed `kinds` (number[]).
 */
export const NostrFilterSchema = z
  .looseObject({
    ids: z.array(z.string()).optional(),
    authors: z.array(z.string()).optional(),
    kinds: z.array(z.number().int()).optional(),
    since: z.number().int().optional(),
    until: z.number().int().optional(),
    limit: z.number().int().optional(),
  });
export type NostrFilter = z.infer<typeof NostrFilterSchema>;

/**
 * WebSocket message format for publishing an event to a relay.
 * Format: ["EVENT", <event>]
 */
export const ClientEventMessageSchema = z.tuple([
  z.literal("EVENT"),
  NostrEventSchema,
]);
export type ClientEventMessage = z.infer<typeof ClientEventMessageSchema>;

/**
 * WebSocket message format for requesting events from a relay.
 * Format: ["REQ", <subscription_id>, <filter1>, <filter2>, ...]
 *
 * AI-NOTE: Zod tuples are fixed-length, so we use an array with refinement
 * to validate the REQ message structure: first element is "REQ", second is
 * subscription ID, and remaining elements are filters.
 */
export const ClientReqMessageSchema = z
  .array(z.union([z.literal("REQ"), z.string(), NostrFilterSchema]))
  .refine(
    (arr): arr is [string, string, ...z.infer<typeof NostrFilterSchema>[]] =>
      arr.length >= 3 && arr[0] === "REQ" && typeof arr[1] === "string",
    {
      message: 'REQ message must have format ["REQ", <sub_id>, <filter>, ...]',
    },
  );
export type ClientReqMessage = z.infer<typeof ClientReqMessageSchema>;

/**
 * WebSocket message format for closing a subscription to a relay.
 * Format: ["CLOSE", <subscription_id>]
 */
export const ClientCloseMessageSchema = z.tuple([
  z.literal("CLOSE"),
  z.string(),
]);
export type ClientCloseMessage = z.infer<typeof ClientCloseMessageSchema>;

/**
 * All client-to-relay message types.
 */
export const ClientMessageSchema = z.union([
  ClientEventMessageSchema,
  ClientReqMessageSchema,
  ClientCloseMessageSchema,
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

/**
 * WebSocket message format for returning event matching a subscription from a relay.
 * Format: ["EVENT", <subscription_id>, <event>]
 */
export const RelayEventMessageSchema = z.tuple([
  z.literal("EVENT"),
  z.string(),
  NostrEventSchema,
]);
export type RelayEventMessage = z.infer<typeof RelayEventMessageSchema>;

/**
 * WebSocket message format to indicate the end of stored events on a relay for a given
 * subscription.
 * Format: ["EOSE", <subscription_id>]
 */
export const RelayEoseMessageSchema = z.tuple([
  z.literal("EOSE"),
  z.string(),
]);
export type RelayEoseMessage = z.infer<typeof RelayEoseMessageSchema>;

/**
 * WebSocket message format used by a relay to acknowledge an event published by a client.
 * Format: ["OK", <event_id>, <accepted>, <message>]
 */
export const RelayOkMessageSchema = z.tuple([
  z.literal("OK"),
  z.string(),
  z.boolean(),
  z.string(),
]);
export type RelayOkMessage = z.infer<typeof RelayOkMessageSchema>;

/**
 * WebSocket message format used by a relay to send a human-readable notice.
 * Format: ["NOTICE", <message>]
 */
export const RelayNoticeMessageSchema = z.tuple([
  z.literal("NOTICE"),
  z.string(),
]);
export type RelayNoticeMessage = z.infer<typeof RelayNoticeMessageSchema>;

/**
 * WebSocket message format used by a relay to request NIP-42 authentication from the client.
 * Format: ["AUTH", <challenge>]
 */
export const RelayAuthMessageSchema = z.tuple([
  z.literal("AUTH"),
  z.string(),
]);
export type RelayAuthMessage = z.infer<typeof RelayAuthMessageSchema>;

/**
 * All relay-to-client message types.
 */
export const RelayMessageSchema = z.union([
  RelayEventMessageSchema,
  RelayEoseMessageSchema,
  RelayOkMessageSchema,
  RelayNoticeMessageSchema,
  RelayAuthMessageSchema,
]);
export type RelayMessage = z.infer<typeof RelayMessageSchema>;
