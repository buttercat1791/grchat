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

import type { Context } from "fresh";
import type { State } from "@/utils.ts";
import { AppServices } from "@/shared/app-services.ts";
import {
  type PendingConnectionData,
  PendingConnectionDataSchema,
} from "@/features/auth/schemas/pending-connection-schema.ts";
import { getAppConfig, getAuthConfig } from "@/features/config/index.ts";
import { Lazy } from "@/shared/utils/lazy.ts";

/**
 * Get relay URLs for NIP-46 communication from configuration
 */
function getRelayUrls(): string[] {
  const authConfig = getAuthConfig();
  // Return default relay plus additional allowed relays
  return [authConfig.relays.default, ...authConfig.relays.allow.slice(0, 2)];
}

/**
 * Get application metadata from configuration
 */
function getAppMetadata(): { name: string; url: string } {
  const appConfig = getAppConfig();
  return {
    name: appConfig.name,
    url: appConfig.base_url,
  };
}

// AI-NOTE: Store pending connections in memory.
// AI-TODO: Consider using Valkey with short TTL for multi-instance deployments.
// AI-TODO: This is an anti-pattern and should be replaced with a more robust storage pattern.
const pendingConnections = new Map<string, PendingConnectionData>();

// AI-NOTE: Use Lazy<T> to defer config access until first use, avoiding module initialization
// order issues. Config may not be initialized when this module is imported.
const lazyAuthConfig = new Lazy(() => getAuthConfig());
const PENDING_TTL_MS = new Lazy(() => lazyAuthConfig.value.nip46_pending.ttl);
const CLEANUP_INTERVAL_MS = new Lazy(
  () => lazyAuthConfig.value.nip46_pending.cleanup_interval,
);

function initializeConnectionManager() {
  // Clean up stale connections
  setInterval(() => {
    const expirationTime = Date.now() - PENDING_TTL_MS.value;
    for (const [id, data] of pendingConnections.entries()) {
      if (data.createdAt < expirationTime) {
        pendingConnections.delete(id);
      }
    }
  }, CLEANUP_INTERVAL_MS.value);
}

// AI-NOTE: Wrap initialization in Lazy to defer until first handler invocation
const connectionManagerInitialized = new Lazy(() => {
  initializeConnectionManager();
  return true;
});

export function nostrconnectHandler(_ctx: Context<State>): Response {
  // Ensure connection manager is initialized on first request
  connectionManagerInitialized.value;

  try {
    const services = AppServices.instance;
    const nip46Service = services.nip46Service;

    // Get relay URLs and metadata from config
    const relayUrls = getRelayUrls();
    const appMetadata = getAppMetadata();

    // Generate nostrconnect URL and connection ID
    const { connectionId, url, connection } = nip46Service
      .generateNostrconnectUrl(
        relayUrls,
        appMetadata,
      );

    // Store connection data for polling
    const createdAt = Date.now();
    const expiresAt = new Date(createdAt + PENDING_TTL_MS.value);
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
}

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
