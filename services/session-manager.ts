/**
 * Session Management Service
 *
 * Manages user sessions in Valkey, handling creation, retrieval, validation,
 * and deletion of session state.
 *
 * @see ../architecture/SESSIONS.md
 */

import { z } from "zod";
import { ValkeyClient } from "./valkey-client.ts";
import {
  buildSessionState,
  isSessionValid,
  SessionModelError,
  SessionState,
} from "@/schemas/session.ts";
import { sessionModelToCsv } from "@/schemas/codecs.ts";
import { Nip46Connection } from "./nip46-auth.ts";

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
  session?: z.infer<typeof SessionState>;
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
 * Provides CRUD operations for user sessions persisted in Valkey.
 * Sessions are stored as CSV-formatted strings with a 24-hour TTL.
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
  private valkeyClient: ValkeyClient;

  constructor(valkeyClient: ValkeyClient) {
    this.valkeyClient = valkeyClient;
  }

  /**
   * Creates a new session after successful NIP-46 handshake.
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
  ): Promise<z.infer<typeof SessionState>> {
    try {
      // Build session state
      const session = buildSessionState(
        userPubkey,
        connection.signerPubkey,
        connection.relayUrls,
      );

      // Serialize to CSV
      const csv = sessionModelToCsv.decode(session);

      // Store in Valkey with TTL
      const key = this.getSessionKey(userPubkey);
      const client = this.valkeyClient.getClient();

      await client.set(key, csv);
      await client.expire(key, SESSION_TTL_SECONDS);

      return session;
    } catch (error) {
      if (error instanceof SessionModelError) {
        throw new SessionError("Failed to create session", { cause: error });
      }
      throw new SessionError("Failed to store session in database", {
        cause: error,
      });
    }
  }

  /**
   * Retrieves a session from Valkey by user public key.
   *
   * @param userPubkey - The user's public key
   * @returns The session state if found, null otherwise
   *
   * @throws {SessionError} If retrieval fails
   */
  async getSession(
    userPubkey: string,
  ): Promise<z.infer<typeof SessionState> | null> {
    try {
      const key = this.getSessionKey(userPubkey);
      const client = this.valkeyClient.getClient();

      const csv = await client.get(key);

      if (!csv) {
        return null;
      }

      // Deserialize from CSV
      const session = sessionModelToCsv.encode(csv);

      return session;
    } catch (error) {
      throw new SessionError("Failed to retrieve session", { cause: error });
    }
  }

  /**
   * Updates an existing session in Valkey.
   *
   * Preserves the remaining TTL on the session key.
   *
   * @param session - The updated session state
   *
   * @throws {SessionError} If update fails
   */
  async updateSession(session: z.infer<typeof SessionState>): Promise<void> {
    try {
      const key = this.getSessionKey(session.userPubkey);
      const client = this.valkeyClient.getClient();

      // Get remaining TTL
      const ttl = await client.ttl(key);

      if (ttl <= 0) {
        throw new SessionError("Session no longer exists or has expired");
      }

      // Serialize to CSV
      const csv = sessionModelToCsv.decode(session);

      // Update with preserved TTL
      await client.set(key, csv);
      await client.expire(key, ttl);
    } catch (error) {
      if (error instanceof SessionError) {
        throw error;
      }
      throw new SessionError("Failed to update session", { cause: error });
    }
  }

  /**
   * Deletes a session from Valkey.
   *
   * @param userPubkey - The user's public key
   *
   * @throws {SessionError} If deletion fails
   */
  async deleteSession(userPubkey: string): Promise<void> {
    try {
      const key = this.getSessionKey(userPubkey);
      const client = this.valkeyClient.getClient();

      await client.del([key]);
    } catch (error) {
      throw new SessionError("Failed to delete session", { cause: error });
    }
  }

  /**
   * Validates a session by user public key.
   *
   * Checks that the session exists, can be parsed, and hasn't expired.
   *
   * @param userPubkey - The user's public key
   * @returns Validation result with session if valid
   */
  async validateSession(userPubkey: string): Promise<SessionValidation> {
    try {
      const session = await this.getSession(userPubkey);

      if (!session) {
        return { valid: false, reason: "not_found" };
      }

      if (!isSessionValid(session)) {
        return { valid: false, reason: "expired" };
      }

      return { valid: true, session };
    } catch {
      return { valid: false, reason: "invalid_format" };
    }
  }

  /**
   * Marks a session's NIP-42 challenge as succeeded.
   *
   * @param userPubkey - The user's public key
   *
   * @throws {SessionError} If session not found or update fails
   */
  async markChallengeSucceeded(userPubkey: string): Promise<void> {
    const session = await this.getSession(userPubkey);

    if (!session) {
      throw new SessionError("Session not found");
    }

    session.challengeState = "succeeded";
    session.challengeIssuedAt = new Date().toISOString();

    await this.updateSession(session);
  }

  /**
   * Marks a session's NIP-42 challenge as failed.
   *
   * @param userPubkey - The user's public key
   *
   * @throws {SessionError} If session not found or update fails
   */
  async markChallengeFailed(userPubkey: string): Promise<void> {
    const session = await this.getSession(userPubkey);

    if (!session) {
      throw new SessionError("Session not found");
    }

    session.challengeState = "failed";

    await this.updateSession(session);
  }

  /**
   * Gets all active sessions (for administrative purposes).
   *
   * Note: This is an expensive operation and should be used sparingly.
   *
   * @returns Array of all active sessions
   */
  async getAllSessions(): Promise<z.infer<typeof SessionState>[]> {
    try {
      const client = this.valkeyClient.getClient();

      // Scan for all session keys
      const pattern = `${SESSION_KEY_PREFIX}*`;
      const keys: string[] = [];

      // AI-NOTE: SCAN is not directly supported by GLIDE in the same way.
      // Using KEYS for simplicity, but this should be replaced with SCAN
      // for production use to avoid blocking the database.
      const allKeys = await client.keys(pattern);
      keys.push(...allKeys);

      // Retrieve all sessions
      const sessions: z.infer<typeof SessionState>[] = [];

      for (const key of keys) {
        try {
          const csv = await client.get(key);
          if (csv) {
            const session = sessionModelToCsv.encode(csv);
            sessions.push(session);
          }
        } catch {
          // Skip invalid sessions
        }
      }

      return sessions;
    } catch (error) {
      throw new SessionError("Failed to retrieve sessions", { cause: error });
    }
  }

  /**
   * Checks if a session exists for a user.
   *
   * @param userPubkey - The user's public key
   * @returns True if session exists, false otherwise
   */
  async sessionExists(userPubkey: string): Promise<boolean> {
    try {
      const key = this.getSessionKey(userPubkey);
      const client = this.valkeyClient.getClient();

      const exists = await client.exists([key]);
      return exists > 0;
    } catch (error) {
      throw new SessionError("Failed to check session existence", {
        cause: error,
      });
    }
  }

  /**
   * Gets the remaining TTL for a session in seconds.
   *
   * @param userPubkey - The user's public key
   * @returns TTL in seconds, or -1 if no TTL, or -2 if key doesn't exist
   */
  async getSessionTTL(userPubkey: string): Promise<number> {
    try {
      const key = this.getSessionKey(userPubkey);
      const client = this.valkeyClient.getClient();

      return await client.ttl(key);
    } catch (error) {
      throw new SessionError("Failed to get session TTL", { cause: error });
    }
  }

  /**
   * Gets the Valkey key for a session.
   */
  private getSessionKey(userPubkey: string): string {
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
