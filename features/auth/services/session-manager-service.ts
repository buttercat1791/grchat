/**
 * Session Management Service
 *
 * Manages user sessions in the database, handling creation, retrieval, validation,
 * and deletion of session state.
 *
 * @see ../architecture/SESSIONS.md
 */

import { z } from "zod";
import type { DatabaseService } from "@/shared/database/database-service.ts";
import {
  buildSessionState,
  type SessionState,
  SessionStateSchema,
} from "@/shared/session-schema.ts";
import { sessionModelToCsv } from "@/shared/codecs.ts";
import {
  Nip46Connection,
  Nip46ConnectionSchema,
} from "@/features/auth/services/nip46-auth-service.ts";
import { NIDSchema } from "@/shared/nostr/events-schema.ts";
import { getAuthConfig } from "@/features/config/index.ts";

/**
 * Error thrown when session operations fail.
 */
export class SessionError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SessionError";
  }
}

/**
 * Session status event schemas for SSE broadcasting
 */

// Connected event - sent when client first connects
const SessionConnectedEventSchema = z.object({
  type: z.literal("connected"),
});
export type SessionConnectedEvent = z.infer<
  typeof SessionConnectedEventSchema
>;

// Session expired event - sent when session becomes invalid
const SessionExpiredEventSchema = z.object({
  type: z.literal("session_expired"),
  reason: z.string(),
});
export type SessionExpiredEvent = z.infer<typeof SessionExpiredEventSchema>;

// Union of all session status events
const SessionStatusEventSchema = z.discriminatedUnion("type", [
  SessionConnectedEventSchema,
  SessionExpiredEventSchema,
]);
export type SessionStatusEvent = z.infer<typeof SessionStatusEventSchema>;

/**
 * SSE client connection for session status notifications
 */
interface SessionClient {
  userPubkey: string;
  controller: ReadableStreamDefaultController;
  encoder: TextEncoder;
}

/**
 * Session validation result.
 */
export interface SessionValidation {
  /** Whether the session is valid */
  valid: boolean;
  /** The session state if valid, undefined otherwise */
  session?: SessionState;
  /** Reason for invalidity if not valid */
  reason?: "not_found" | "expired" | "invalid_format";
}

/**
 * Session Management Service.
 *
 * Provides CRUD operations for user sessions persisted in a database. Sessions are stored as
 * CSV-formatted strings with a 24-hour TTL.
 *
 * @example
 * ```ts
 * const sessionManager = new SessionManager(databaseService);
 *
 * // Create a session after successful authentication
 * const session = await sessionManager.createSession(connection, userPubkey);
 *
 * // Later, retrieve the session
 * const retrieved = await sessionManager.getSession(userPubkey);
 * if (retrieved && isSessionValid(retrieved)) {
 *   // Session is valid, proceed
 * }
 *
 * // Update session after NIP-42 challenge
 * session.challengeState = "succeeded";
 * await sessionManager.updateSession(session);
 *
 * // Delete on logout
 * await sessionManager.deleteSession(userPubkey);
 * ```
 */
export class SessionManager {
  #databaseService: DatabaseService;
  // Map of userPubkey -> Set of connected SSE clients for session status notifications
  #clients: Map<string, Set<SessionClient>> = new Map();

  constructor(databaseService: DatabaseService) {
    this.#databaseService = databaseService;
  }

  /**
   * Creates a new session from NIP-46 connection data after a successful handshake.
   *
   * @param connection - The NIP-46 connection state
   * @param userPubkey - The user's public key (identity)
   * @returns The created session state
   *
   * @throws {SessionError} If session creation fails
   */
  async createSession(
    connection: Nip46Connection,
    userPubkey: string,
  ): Promise<SessionState> {
    // Preconditions: validate arguments
    const conn = Nip46ConnectionSchema.parse(connection);
    const userPK = NIDSchema.parse(userPubkey);

    // Build session state
    let session: SessionState;
    try {
      session = buildSessionState(
        userPK,
        conn.signerPubkey,
        conn.relayUrls,
      );
    } catch (error) {
      throw new SessionError("Failed to create session", { cause: error });
    }

    // Serialize to CSV
    const csv = sessionModelToCsv.decode(session);

    // Store in database with TTL
    const key = this.#buildSessionKey(userPK);
    const success = await this.#databaseService.setStringWithTTL(
      key,
      csv,
      Math.floor(
        getAuthConfig().session_manager.session_ttl / 1000,
      ),
    );

    if (!success) {
      throw new SessionError(
        "Failed to set session data and/or TTL to database",
      );
    }

    return session;
  }

  /**
   * Retrieves a session from the database by user public key.
   *
   * @param userPubkey - The user's public key
   * @returns The session state if found, null otherwise
   */
  async getSession(
    userPubkey: string,
  ): Promise<SessionState | null> {
    // Precondition: validate user pubkey argument
    const userPK = NIDSchema.parse(userPubkey);

    const key = this.#buildSessionKey(userPK);
    const csv = await this.#databaseService.getString(key);

    if (!csv) {
      return null;
    }

    // Deserialize from CSV
    const session = sessionModelToCsv.encode(csv);
    return SessionStateSchema.parse(session);
  }

  /**
   * Updates data for an existing session in the database while retaining the session's TTL.
   *
   * @param session - The updated session state
   *
   * @throws {SessionError} If the update fails
   */
  async updateSession(session: SessionState): Promise<void> {
    // Precondition: validate session argument
    const sess = SessionStateSchema.parse(session);

    const key = this.#buildSessionKey(sess.userPubkey);

    // Get current TTL
    const ttl = await this.#databaseService.ttl(key);
    if (!ttl || ttl <= 0) {
      throw new SessionError("Session no longer exists or has expired");
    }

    // Serialize to CSV
    const csv = sessionModelToCsv.decode(sess);

    // Update with preserved TTL
    const success = await this.#databaseService.setStringWithTTL(key, csv, ttl);
    if (!success) {
      throw new SessionError(
        "Failed to set session data and/or TTL to database",
      );
    }
  }

  /**
   * Deletes a session from the database.
   *
   * @param userPubkey - The user's public key
   *
   * @throws {SessionError} If the deletion fails
   */
  async deleteSession(userPubkey: string): Promise<void> {
    // Precondition: validate user pubkey argument
    const userPK = NIDSchema.parse(userPubkey);

    const key = this.#buildSessionKey(userPK);
    const success = await this.#databaseService.delete(key);
    if (!success) {
      throw new SessionError("Failed to delete session");
    }
  }

  /**
   * Checks if a session exists for a user.
   *
   * @param userPubkey - The user's public key
   * @returns True if session exists, false otherwise
   */
  sessionExists(userPubkey: string): Promise<boolean> {
    // Precondition: validate user pubkey argument
    const userPK = NIDSchema.parse(userPubkey);

    const key = this.#buildSessionKey(userPK);
    return this.#databaseService.exists(key);
  }

  /**
   * Gets the remaining TTL for a session in seconds.
   *
   * @param userPubkey - The user's public key
   * @returns TTL in seconds, or null if key doesn't exist or has no expiry.
   */
  getSessionTTL(userPubkey: string): Promise<number | null> {
    // Precondition: validate user pubkey argument
    const userPK = NIDSchema.parse(userPubkey);

    const key = this.#buildSessionKey(userPK);
    return this.#databaseService.ttl(key);
  }

  /**
   * Gets the database key for a session.
   */
  #buildSessionKey(userPubkey: string): string {
    // AI-NOTE: userPubkey is already validated by callers
    return `${getAuthConfig().session_manager.valkey_prefix}${userPubkey}`;
  }

  /**
   * Registers a new SSE client for session status notifications.
   *
   * Supports 1..N user/session relationship. One user may have multiple active sessions on
   * different clients. All the sessions share the same NIP-46 remote signer connection.
   *
   * @param userPubkey - The user's public key
   * @param controller - The ReadableStream controller for sending events
   * @returns Cleanup function to call when client disconnects
   */
  registerClient(
    userPubkey: string,
    controller: ReadableStreamDefaultController,
  ): () => void {
    const client: SessionClient = {
      userPubkey,
      controller,
      encoder: new TextEncoder(),
    };

    // Add client to the set for this user
    if (!this.#clients.has(userPubkey)) {
      this.#clients.set(userPubkey, new Set());
    }
    this.#clients.get(userPubkey)!.add(client);

    // Send initial connection confirmation
    this.#sendEvent(client, { type: "connected" });

    // Return cleanup function
    return () => {
      const clients = this.#clients.get(userPubkey);
      if (clients) {
        clients.delete(client);
        if (clients.size === 0) {
          this.#clients.delete(userPubkey);
        }
      }
    };
  }

  /**
   * Broadcasts a session expired event to all clients for a user.
   *
   * @param userPubkey - The user's public key
   * @param reason - The reason for session expiry
   */
  broadcastSessionExpired(userPubkey: string, reason: string): void {
    const clients = this.#clients.get(userPubkey);
    if (!clients || clients.size === 0) {
      console.debug(
        `[SessionManager] No connected clients for ${userPubkey}`,
      );
      return;
    }

    console.log(
      `[SessionManager] Broadcasting session_expired to ${clients.size} client(s) for ${userPubkey}`,
    );

    const event: SessionStatusEvent = {
      type: "session_expired",
      reason,
    };

    // Send to all connected clients for this user
    for (const client of clients) {
      this.#sendEvent(client, event);
    }

    // Clean up all clients for this user after broadcasting
    this.#clients.delete(userPubkey);
  }

  /**
   * Sends an event to a specific SSE client.
   *
   * @param client - The client to send to
   * @param event - The event data to send (validated against SessionStatusEventSchema)
   */
  #sendEvent(client: SessionClient, event: SessionStatusEvent): void {
    try {
      // Validate event against schema
      const validatedEvent = SessionStatusEventSchema.parse(event);
      const data = JSON.stringify(validatedEvent);
      client.controller.enqueue(
        client.encoder.encode(`data: ${data}\n\n`),
      );
    } catch (error) {
      console.error(
        `[SessionManager] Failed to send event to ${client.userPubkey}:`,
        error,
      );
    }
  }
}

/**
 * Creates a new session manager instance.
 *
 * @param databaseService - The database service to use
 * @returns A new SessionManager instance
 */
export function createSessionManager(
  databaseService: DatabaseService,
): SessionManager {
  return new SessionManager(databaseService);
}
