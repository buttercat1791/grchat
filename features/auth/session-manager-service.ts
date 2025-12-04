/**
 * Session Management Service
 *
 * Manages user sessions in Valkey, handling creation, retrieval, validation,
 * and deletion of session state.
 *
 * @see ../architecture/SESSIONS.md
 */

import { ValkeyClient } from "@/shared/valkey-client.ts";
import {
  buildSessionState,
  isSessionValid,
  type SessionState,
  SessionStateSchema,
} from "@/shared/session-schema.ts";
import { sessionModelToCsv } from "@/shared/codecs.ts";
import {
  Nip46Connection,
  Nip46ConnectionSchema,
} from "@/features/auth/nip46-auth-service.ts";
import { NIDSchema } from "@/shared/nostr/events-schema.ts";

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
 * Session key prefix in Valkey.
 */
const SESSION_KEY_PREFIX = "session.";

/**
 * Session TTL in seconds (24 hours).
 */
const SESSION_TTL_SECONDS = 24 * 60 * 60;

/**
 * Session Management Service.
 *
 * Provides CRUD operations for user sessions persisted in a database. Sessions are stored as
 * CSV-formatted strings with a 24-hour TTL.
 *
 * @example
 * ```ts
 * const sessionManager = new SessionManager(valkeyClient);
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
  #valkeyClient: ValkeyClient;

  constructor(valkeyClient: ValkeyClient) {
    this.#valkeyClient = valkeyClient;
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

    // Store in Valkey with TTL
    const key = this.buildSessionKey(userPK);
    const success = await this.#valkeyClient.setWithTTL(
      key,
      csv,
      SESSION_TTL_SECONDS,
    );

    if (!success) {
      throw new SessionError(
        "Failed to set session data and/or TTL to database",
      );
    }

    return session;
  }

  /**
   * Retrieves a session from Valkey by user public key.
   *
   * @param userPubkey - The user's public key
   * @returns The session state if found, null otherwise
   */
  async getSession(
    userPubkey: string,
  ): Promise<SessionState | null> {
    // Precondition: validate user pubkey argument
    const userPK = NIDSchema.parse(userPubkey);

    const key = this.buildSessionKey(userPK);
    const csv = await this.#valkeyClient.getString(key);

    if (!csv) {
      return null;
    }

    // Deserialize from CSV
    const session = sessionModelToCsv.encode(csv);
    return SessionStateSchema.parse(session);
  }

  /**
   * Updates data for an existing session in Valkey while retaining the session's TTL.
   *
   * @param session - The updated session state
   *
   * @throws {SessionError} If the update fails
   */
  async updateSession(session: SessionState): Promise<void> {
    // Precondition: validate session argument
    const sess = SessionStateSchema.parse(session);

    const key = this.buildSessionKey(sess.userPubkey);

    // Get current TTL
    const ttl = await this.#valkeyClient.ttl(key);
    if (!ttl || ttl <= 0) {
      throw new SessionError("Session no longer exists or has expired");
    }

    // Serialize to CSV
    const csv = sessionModelToCsv.decode(sess);

    // Update with preserved TTL
    const success = await this.#valkeyClient.setWithTTL(key, csv, ttl);
    if (!success) {
      throw new SessionError(
        "Failed to set session data and/or TTL to database",
      );
    }
  }

  /**
   * Deletes a session from Valkey.
   *
   * @param userPubkey - The user's public key
   *
   * @throws {SessionError} If the deletion fails
   */
  async deleteSession(userPubkey: string): Promise<void> {
    // Precondition: validate user pubkey argument
    const userPK = NIDSchema.parse(userPubkey);

    const key = this.buildSessionKey(userPK);
    const success = await this.#valkeyClient.delete(key);
    if (!success) {
      throw new SessionError("Failed to delete session");
    }
  }

  /**
   * Validates a session by user public key. Checks that the session for the given public key
   * exists, can be parsed, and hasn't expired.
   *
   * @param userPubkey - The user's public key
   * @returns Validation result with session if valid
   */
  async validateSession(userPubkey: string): Promise<SessionValidation> {
    // Precondition: validate user pubkey argument
    const userPK = NIDSchema.parse(userPubkey);

    const session = await this.getSession(userPK);

    if (!session) {
      return { valid: false, reason: "not_found" };
    }

    if (!isSessionValid(session)) {
      return { valid: false, reason: "expired" };
    }

    return { valid: true, session };
  }

  /**
   * Marks a session's NIP-42 challenge as succeeded.
   *
   * @param userPubkey - The user's public key
   *
   * @throws {SessionError} If session not found or update fails
   */
  async markChallengeSucceeded(userPubkey: string): Promise<void> {
    // Precondition: validate user pubkey argument
    const userPK = NIDSchema.parse(userPubkey);

    const session = await this.getSession(userPK);
    if (!session) {
      throw new SessionError("Session not found");
    }

    const updatedSession = SessionStateSchema.parse({
      ...session,
      challengeState: "succeeded",
      challengeIssuedAt: new Date().toISOString(),
    });

    await this.updateSession(updatedSession);
  }

  /**
   * Marks a session's NIP-42 challenge as failed.
   *
   * @param userPubkey - The user's public key
   *
   * @throws {SessionError} If session not found or update fails
   */
  async markChallengeFailed(userPubkey: string): Promise<void> {
    // Precondition: validate user pubkey argument
    const userPK = NIDSchema.parse(userPubkey);

    const session = await this.getSession(userPK);
    if (!session) {
      throw new SessionError("Session not found");
    }

    const updatedSession = SessionStateSchema.parse({
      ...session,
      challengeState: "failed",
    });

    await this.updateSession(updatedSession);
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

    const key = this.buildSessionKey(userPK);
    return this.#valkeyClient.hasKey(key);
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

    const key = this.buildSessionKey(userPK);
    return this.#valkeyClient.ttl(key);
  }

  /**
   * Gets the Valkey key for a session.
   */
  private buildSessionKey(userPubkey: string): string {
    // AI-NOTE: userPubkey is already validated by callers
    return `${SESSION_KEY_PREFIX}${userPubkey}`;
  }
}

/**
 * Creates a new session manager instance.
 *
 * @param valkeyClient - The Valkey client to use
 * @returns A new SessionManager instance
 */
export function createSessionManager(
  valkeyClient: ValkeyClient,
): SessionManager {
  return new SessionManager(valkeyClient);
}
