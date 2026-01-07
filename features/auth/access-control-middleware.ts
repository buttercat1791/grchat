/**
 * Access Control Middleware
 *
 * Provides authentication and authorization logic for protecting routes.
 * This module contains the core middleware handler and helper functions for:
 * - Validating authentication cookies
 * - Verifying active sessions
 * - Checking user access control
 * - Handling authentication/authorization failures
 */

import type { Context } from "fresh";
import type { State } from "@/utils.ts";
import { AppServices } from "@/shared/app-services.ts";
import { createUserAccessControl } from "@/features/auth/user-access-control.ts";
import { clearAuthCookie, getAuthCookie } from "@/features/auth/auth-cookie.ts";

/**
 * Public paths that don't require authentication.
 */
const PUBLIC_PATHS = [
  "/login",
  "/api/auth/",
  "/access-denied",
];

/**
 * Checks if a pathname is a public path.
 */
function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

/**
 * Checks if a request is for an API endpoint.
 */
function isApiRequest(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

/**
 * Handles unauthenticated requests.
 * - For API requests: returns 401 Unauthorized with HAL+JSON links
 * - For page requests: redirects to login page
 */
function handleUnauthenticated(ctx: Context<State>): Response {
  if (isApiRequest(ctx.url.pathname)) {
    return Response.json(
      {
        error: "Authentication required",
        _links: {
          login: {
            href: "/login",
            rel: "login",
          },
        },
      },
      { status: 401 },
    );
  }

  // Redirect to login page (307 preserves request method)
  return new Response(null, {
    status: 307,
    headers: {
      "Location": "/login",
    },
  });
}

/**
 * Handles expired or invalid sessions.
 * - Clears the auth cookie
 * - For API requests: returns 401 Unauthorized with HAL+JSON links
 * - For page requests: redirects to login page
 */
function handleSessionExpired(ctx: Context<State>): Response {
  const headers = new Headers();
  clearAuthCookie(headers);

  if (isApiRequest(ctx.url.pathname)) {
    headers.set("Content-Type", "application/json");
    return new Response(
      JSON.stringify({
        error: "Session expired",
        _links: {
          login: {
            href: "/login",
            rel: "login",
          },
        },
      }),
      {
        status: 401,
        headers,
      },
    );
  }

  // Redirect to login page (307 preserves request method)
  headers.set("Location", "/login");
  return new Response(null, {
    status: 307,
    headers,
  });
}

/**
 * Handles access denied (user not in allow list or in deny list).
 * - For API requests: returns 403 Forbidden
 * - For page requests: redirects to access denied page
 */
function handleAccessDenied(ctx: Context<State>): Response {
  if (isApiRequest(ctx.url.pathname)) {
    return Response.json(
      {
        error: "Forbidden: User is not authorized to access this application",
      },
      { status: 403 },
    );
  }

  // Redirect to access denied page (303 for GET after POST)
  return new Response(null, {
    status: 303,
    headers: {
      "Location": "/access-denied",
    },
  });
}

/**
 * Access control middleware handler.
 *
 * This middleware:
 * 1. Allows public routes without authentication
 * 2. Validates auth cookie on protected routes
 * 3. Verifies session exists in Valkey
 * 4. Checks user access control against allow/deny lists
 * 5. Sets auth context in ctx.state for downstream handlers
 *
 * @param ctx - Fresh request context
 * @returns Response or passes control to next handler
 */
export async function accessControlMiddlewareHandler(
  ctx: Context<State>,
): Promise<Response> {
  // Public routes - allow without auth
  if (isPublicPath(ctx.url.pathname)) {
    ctx.state.auth = { isAuthenticated: false, userPubkey: null };
    return await ctx.next();
  }

  // Read pubkey from cookie
  const pubkey = getAuthCookie(ctx.req);

  // If the pubkey cookie is not sent, redirect to login (for pages) or 401 (for API)
  if (!pubkey) {
    return handleUnauthenticated(ctx);
  }

  // Validate session exists in Valkey
  const sessionManager = AppServices.instance.sessionManager;
  const sessionExists = await sessionManager.sessionExists(pubkey);
  if (!sessionExists) {
    // If session is expired/invalid, then clear cookie and redirect to login
    return handleSessionExpired(ctx);
  }

  // For page routes (not API routes), verify active connection via keepalive service
  if (!isApiRequest(ctx.url.pathname)) {
    const keepaliveService = AppServices.instance.keepaliveService;
    const hasActiveConnection = keepaliveService.isTracking(pubkey);
    if (!hasActiveConnection) {
      // No active connection found, redirect to login
      return handleSessionExpired(ctx);
    }
  }

  // Check user access control
  const accessControl = createUserAccessControl();
  if (!accessControl.isUserAllowed(pubkey)) {
    return handleAccessDenied(ctx);
  }

  // Set auth context in state for downstream handlers
  ctx.state.auth = { isAuthenticated: true, userPubkey: pubkey };
  return await ctx.next();
}
