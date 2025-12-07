/**
 * API Route: POST /api/auth/nostrconnect
 *
 * Begins a client-initiated authentication handshake by opening a connection from the server to
 * the auth relays specified in the `nostrconnect://` connection string. Creates a connection
 * resource as a side effect. The URI of the created connection is given in the response.
 *
 * Response (201 Created):
 * {
 *   url: string;           // The nostrconnect:// URL to display as QR code
 *   connectionId: string;  // Unique ID to poll for handshake completion
 *   status: string;        // Connection status ("pending")
 *   expiresAt: string;     // ISO 8601 timestamp when connection expires (5 minutes)
 *   _links: {
 *     self: { href: string, title: string },
 *     handshake: { href: string, title: string }
 *   }
 * }
 *
 * Response (error):
 * {
 *   error: string;
 * }
 */

import { AppServices } from "@/shared/app-services.ts";
import { define } from "@/utils.ts";
import { generate } from "@std/uuid/unstable-v7";
import {
  type PendingConnectionData,
  PendingConnectionDataSchema,
} from "@/features/auth/pending-connection-schema.ts";

// AI-NOTE: Default relay URLs for NIP-46 communication
// These can be overridden via environment variables in production
const DEFAULT_RELAY_URLS = [
  "wss://relay.damus.io",
  "wss://relay.snort.social",
];

const APP_METADATA = {
  name: "grchat",
  url: "https://grchat.example.com", // AI-TODO: Replace with actual URL from config
};

// AI-NOTE: Store pending connections in memory.
// In production, consider using Valkey with short TTL for multi-instance deployments.
// This is an anti-pattern and should be replaced with a more robust and reusable storage pattern.
const pendingConnections = new Map<string, PendingConnectionData>();

// Clean up stale connections (older than 5 minutes)
setInterval(() => {
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  for (const [id, data] of pendingConnections.entries()) {
    if (data.createdAt < fiveMinutesAgo) {
      pendingConnections.delete(id);
    }
  }
}, 60 * 1000); // Run cleanup every minute

export default define.handlers({
  POST() {
    try {
      const services = AppServices.instance;
      const nip46Service = services.nip46Service;

      // TODO: Get relay URLs and metadata from app config, rather than hard-coding.
      // Generate nostrconnect URL
      const { url, connection } = nip46Service.generateNostrconnectUrl(
        DEFAULT_RELAY_URLS,
        APP_METADATA,
      );

      // Generate unique connection ID
      const connectionId = generate();

      // Store connection data for polling
      const createdAt = Date.now();
      const expiresAt = new Date(createdAt + 5 * 60 * 1000);
      const conn = PendingConnectionDataSchema.parse({
        connection,
        createdAt: createdAt,
      });
      pendingConnections.set(connectionId, conn);

      const handshakeUri = `/api/auth/handshake/${connectionId}`;

      const response = {
        url,
        connectionId,
        status: "pending",
        expiresAt: expiresAt.toISOString(),
        _links: {
          self: {
            href: "/api/auth/nostrconnect",
            title: "Begin client-initiated connection handshake",
          },
          handshake: {
            href: handshakeUri,
            title: "Server-sent event stream to signal handshake status",
          },
        },
      };

      return new Response(
        JSON.stringify(response),
        {
          status: 201,
          headers: {
            "Content-Type": "application/hal+json",
            "Location": handshakeUri,
          },
        },
      );
    } catch (error) {
      return Response.json(
        {
          error: error instanceof Error
            ? error.message
            : "Failed to generate connection URL",
        },
        { status: 500 },
      );
    }
  },
});

/**
 * Get pending connection data by ID
 * Exported for use by handshake polling endpoint
 *
 * @param connectionId - The unique connection identifier
 * @returns The pending connection data, or undefined if not found
 */
export function getPendingConnection(
  connectionId: string,
): PendingConnectionData | undefined {
  return pendingConnections.get(connectionId);
}

/**
 * Remove pending connection data by ID
 * Exported for cleanup after successful handshake
 */
export function removePendingConnection(connectionId: string) {
  pendingConnections.delete(connectionId);
}
