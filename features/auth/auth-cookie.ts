/**
 * Authentication Cookie Utilities
 *
 * Provides utilities for managing the authentication cookie that stores the user's
 * public key for session management.
 */

import { deleteCookie, getCookies, setCookie } from "@std/http/cookie";

/**
 * Name of the authentication cookie.
 */
export const AUTH_COOKIE_NAME = "grchat_pubkey";

/**
 * Cookie options for production (with Secure flag).
 */
const PRODUCTION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "Strict" as const,
  path: "/",
};

/**
 * Cookie options for development (without Secure flag for localhost).
 */
const DEVELOPMENT_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: false,
  sameSite: "Strict" as const,
  path: "/",
};

/**
 * Determines if we're running in production based on Deno deployment environment.
 */
function isProduction(): boolean {
  return Deno.env.get("DENO_DEPLOYMENT_ID") !== undefined;
}

/**
 * Gets the appropriate cookie options based on the environment.
 */
function getCookieOptions() {
  return isProduction()
    ? PRODUCTION_COOKIE_OPTIONS
    : DEVELOPMENT_COOKIE_OPTIONS;
}

/**
 * Sets the authentication cookie with the user's public key.
 *
 * @param headers - Response headers to add the Set-Cookie header to
 * @param pubkey - The user's public key (NID)
 */
export function setAuthCookie(headers: Headers, pubkey: string): void {
  setCookie(headers, {
    name: AUTH_COOKIE_NAME,
    value: pubkey,
    ...getCookieOptions(),
  });
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
 * @param headers - Response headers to add the Set-Cookie header to
 */
export function clearAuthCookie(headers: Headers): void {
  deleteCookie(headers, AUTH_COOKIE_NAME, {
    path: "/",
  });
}
