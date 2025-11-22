import z from "zod";
import { NostrEvent } from "./nostr-events.ts";

/**
 * NIP-01 filter for subscription requests.
 *
 * AI-NOTE: Uses passthrough() to allow arbitrary tag filters (#e, #p, etc.)
 * without constraining their types. Tag filters are string arrays, but
 * catchall() would conflict with the explicitly typed `kinds` (number[]).
 */
export const NostrFilter = z
  .looseObject({
    ids: z.array(z.string()).optional(),
    authors: z.array(z.string()).optional(),
    kinds: z.array(z.number().int()).optional(),
    since: z.number().int().optional(),
    until: z.number().int().optional(),
    limit: z.number().int().optional(),
  });

/**
 * WebSocket message format for publishing an event to a relay.
 * Format: ["EVENT", <event>]
 */
export const ClientEventMessage = z.tuple([
  z.literal("EVENT"),
  NostrEvent,
]);

/**
 * WebSocket message format for requesting events from a relay.
 * Format: ["REQ", <subscription_id>, <filter1>, <filter2>, ...]
 *
 * AI-NOTE: Zod tuples are fixed-length, so we use an array with refinement
 * to validate the REQ message structure: first element is "REQ", second is
 * subscription ID, and remaining elements are filters.
 */
export const ClientReqMessage = z
  .array(z.union([z.literal("REQ"), z.string(), NostrFilter]))
  .refine(
    (arr): arr is [string, string, ...z.infer<typeof NostrFilter>[]] =>
      arr.length >= 3 && arr[0] === "REQ" && typeof arr[1] === "string",
    {
      message: 'REQ message must have format ["REQ", <sub_id>, <filter>, ...]',
    },
  );

/**
 * WebSocket message format for closing a subscription to a relay.
 * Format: ["CLOSE", <subscription_id>]
 */
export const ClientCloseMessage = z.tuple([
  z.literal("CLOSE"),
  z.string(),
]);

/**
 * All client-to-relay message types.
 */
export const ClientMessage = z.union([
  ClientEventMessage,
  ClientReqMessage,
  ClientCloseMessage,
]);

/**
 * WebSocket message format for returning event matching a subscription from a relay.
 * Format: ["EVENT", <subscription_id>, <event>]
 */
export const RelayEventMessage = z.tuple([
  z.literal("EVENT"),
  z.string(),
  NostrEvent,
]);

/**
 * WebSocket message format to indicate the end of stored events on a relay for a given
 * subscription.
 * Format: ["EOSE", <subscription_id>]
 */
export const RelayEoseMessage = z.tuple([
  z.literal("EOSE"),
  z.string(),
]);

/**
 * WebSocket message format used by a relay to acknowledge an event published by a client.
 * Format: ["OK", <event_id>, <accepted>, <message>]
 */
export const RelayOkMessage = z.tuple([
  z.literal("OK"),
  z.string(),
  z.boolean(),
  z.string(),
]);

/**
 * WebSocket message format used by a relay to send a human-readable notice.
 * Format: ["NOTICE", <message>]
 */
export const RelayNoticeMessage = z.tuple([
  z.literal("NOTICE"),
  z.string(),
]);

/**
 * WebSocket message format used by a relay to request NIP-42 authentication from the client.
 * Format: ["AUTH", <challenge>]
 */
export const RelayAuthMessage = z.tuple([
  z.literal("AUTH"),
  z.string(),
]);

/**
 * All relay-to-client message types.
 */
export const RelayMessage = z.union([
  RelayEventMessage,
  RelayEoseMessage,
  RelayOkMessage,
  RelayNoticeMessage,
  RelayAuthMessage,
]);
