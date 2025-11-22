/**
 * Session State Type Definitions
 *
 * Defines Zod schemas for user session state. Session state is persisted to Valkey as
 * CSV-formatted strings, and is used to track, among other things, authentication and
 * authorization states.
 *
 * @see ../architecture/SESSIONS.md
 */
import { z } from "zod";
import { NID } from "./nostr-events.ts";

/**
 * NIP-42 challenge state.
 *
 * Tracks whether the NIP-42 challenge has succeeded or failed.
 */
export const ChallengeState = z.enum(["pending", "succeeded", "failed"]);

/**
 * Session state for an authenticated user.
 */
export const SessionState = z.object({
  /** The user's public key (32-byte lowercase hex string) */
  userPubkey: NID,

  /** The remote signer application's public key (32-byte lowercase hex string) */
  signerPubkey: NID,

  /** One or more relay URLs on which the signer is listening */
  relayUrls: z.array(z.url()).min(1),

  /** ISO datetime when the session expires (24 hours from creation) */
  expiresAt: z.iso.datetime(),

  /** NIP-42 challenge state (for read authorization) */
  challengeState: ChallengeState,

  /** ISO datetime when the NIP-42 challenge was issued (optional) */
  challengeIssuedAt: z.iso.datetime().optional(),
});

/**
 * Error thrown when session model operations fail.
 */
export class SessionModelError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SessionModelError";
  }
}

/**
 * Validates that a session has not expired.
 *
 * @param session - The session state to validate
 * @returns True if the session is still valid (not expired), false otherwise
 */
export function isSessionValid(session: z.infer<typeof SessionState>): boolean {
  let state: z.infer<typeof SessionState>;
  try {
    state = SessionState.parse(session);
  } catch {
    return false;
  }

  const now = new Date();
  const expiresAt = new Date(state.expiresAt);

  return expiresAt > now;
}

/**
 * Validates that a NIP-42 challenge has not timed out. Challenges timeout 6 hours after issuance.
 *
 * @param session - The session state to validate
 * @returns True if the challenge is still valid (not timed out), false otherwise
 */
export function isChallengeValid(
  session: z.infer<typeof SessionState>,
): boolean {
  let state: z.infer<typeof SessionState>;
  try {
    state = SessionState.parse(session);
  } catch {
    return false;
  }

  // If no challenge has been issued, it's not valid
  if (!state.challengeIssuedAt) {
    return false;
  }

  const now = new Date();
  const challengeIssuedAt = new Date(state.challengeIssuedAt);
  const challengeTimeout = 6 * 60 * 60 * 1000; // 6 hours in milliseconds

  return (now.getTime() - challengeIssuedAt.getTime()) < challengeTimeout;
}

/**
 * Checks if a session is authorized for read operations.
 *
 * A session is authorized to read if:
 * - The session has not expired
 * - The NIP-42 challenge has succeeded
 *
 * @param session - The session state to check
 * @returns True if the session is authorized to read, false otherwise
 */
export function isAuthorizedToRead(
  session: z.infer<typeof SessionState>,
): boolean {
  return isSessionValid(session) &&
    session.challengeState === "succeeded";
}

/**
 * Creates a new session state object with a 24-hour expiration.
 *
 * @param userPubkey - The user's public key
 * @param signerPubkey - The remote signer's public key
 * @param relayUrls - Relay URLs where the remote signer is listening
 * @returns A new session state object with pending challenge state
 *
 * @throws {SessionModelError} If the session state is invalid
 */
export function buildSessionState(
  userPubkey: string,
  signerPubkey: string,
  relayUrls: string[],
): z.infer<typeof SessionState> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (24 * 60 * 60 * 1000)); // 24 hours from now

  const sessionState: z.infer<typeof SessionState> = {
    userPubkey,
    signerPubkey,
    relayUrls,
    expiresAt: expiresAt.toISOString(),
    challengeState: "pending",
  };

  try {
    return SessionState.parse(sessionState);
  } catch (error) {
    throw new SessionModelError("Failed to create session state", {
      cause: error,
    });
  }
}
