/**
 * Defines Zod schemas for pending NIP-46 connection state.
 *
 * Pending connections are stored temporarily (5 minutes) while waiting for
 * client-initiated authentication handshakes to complete. This data is used
 * to track the connection parameters needed to complete the handshake.
 */

import { z } from "zod";

/**
 * NIP-46 connection parameters for client-initiated flow.
 *
 * This schema represents the connection object returned by the NIP-46 service
 * when generating a nostrconnect:// URL.
 */
export const Nip46ConnectionSchema = z.object({
  /** Client's ephemeral secret key (64-character hex string) */
  clientSecretKey: z.string().length(64).regex(/^[0-9a-f]{64}$/),

  /** Client's ephemeral public key (64-character hex string) */
  clientPubkey: z.string().length(64).regex(/^[0-9a-f]{64}$/),

  /** Array of relay URLs for NIP-46 communication */
  relayUrls: z.array(z.string().url()).min(1),

  /** Optional secret for additional security (opaque string) */
  secret: z.string().optional(),
});
export type Nip46Connection = z.infer<typeof Nip46ConnectionSchema>;

/**
 * Pending connection data stored while waiting for handshake completion.
 *
 * This represents the complete state needed to track and complete a
 * client-initiated NIP-46 authentication handshake.
 */
export const PendingConnectionDataSchema = z.object({
  /** NIP-46 connection parameters */
  connection: Nip46ConnectionSchema,

  /** Unix timestamp (milliseconds) when this connection was created */
  createdAt: z.number().int().positive(),
});
export type PendingConnectionData = z.infer<typeof PendingConnectionDataSchema>;

/**
 * Error thrown when pending connection validation fails.
 */
export class PendingConnectionValidationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PendingConnectionValidationError";
  }
}
