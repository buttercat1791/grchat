/**
 * Authentication Cookie Utilities
 *
 * Provides utilities for managing the authentication cookie that stores the user's
 * public key for session management.
 */

import { deleteCookie, getCookies, setCookie } from "@std/http/cookie";
import { NID } from "../../shared/nostr/events-schema.ts";

/**
 * Name of the authentication cookie.
 */
export const AUTH_COOKIE_NAME = "grchat_user_pubkey";

/**
 * Determines if we're running in production based on Deno deployment environment.
 */
function isProduction(): boolean {
  return Deno.env.get("DENO_DEPLOYMENT_ID") !== undefined;
}

/**
 * Gets the appropriate cookie options based on the environment.
 *
 * The Secure flag is set to `true` in production.
 */
function getCookieOptions() {
  return {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "Strict" as const,
    path: "/",
  };
}

/**
 * Sets the authentication cookie with the user's public key.
 *
 * NB: This function updates the passed `headers` parameter in-place.
 *
 * @param headers - Current response headers collection
 * @param pubkey - The user's public key
 * @returns The updated response headers with the `Set-Cookie` header for grchat added.
 */
export function setAuthCookie(headers: Headers, pubkey: NID): Headers {
  setCookie(headers, {
    name: AUTH_COOKIE_NAME,
    value: pubkey,
    ...getCookieOptions(),
  });
  return headers;
}

/**
 * Reads the user's public key from the authentication cookie.
 *
 * @param request - The incoming request
 * @returns The user's public key if cookie exists, null otherwise
 */
export function getAuthCookie(request: Request): string | null {
  const cookies = getCookies(request.headers);
  return cookies[AUTH_COOKIE_NAME] ?? null;
}

/**
 * Clears the authentication cookie (used on logout or session expiry).
 *
 * @param headers - Response headers
 */
export function clearAuthCookie(headers: Headers): void {
  deleteCookie(headers, AUTH_COOKIE_NAME, {
    path: "/",
  });
}
