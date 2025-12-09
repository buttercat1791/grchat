/**
 * Root Middleware
 *
 * Handles authentication and authorization for all routes. This middleware:
 * - Allows public routes (login page and auth API endpoints) without authentication
 * - Validates auth cookie on all other routes
 * - Verifies session exists in Valkey
 * - Checks user access control against allow/deny lists
 * - Sets auth context in ctx.state for downstream handlers
 */

import { define } from "@/utils.ts";
import { AppServices } from "@/shared/app-services.ts";
import { UserAccessControlService } from "@/features/auth/user-access-control.ts";
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
 * - For API requests: returns 401 Unauthorized
 * - For page requests: redirects to login page
 */
function handleUnauthenticated(ctx: { url: URL }): Response {
  if (isApiRequest(ctx.url.pathname)) {
    return Response.json(
      { error: "Unauthorized: Authentication required" },
      { status: 401 },
    );
  }

  // Redirect to login page
  return new Response(null, {
    status: 302,
    headers: {
      "Location": "/login",
    },
  });
}

/**
 * Handles expired or invalid sessions.
 * - Clears the auth cookie
 * - For API requests: returns 401 Unauthorized
 * - For page requests: redirects to login page
 */
function handleSessionExpired(ctx: { url: URL }): Response {
  const headers = new Headers();
  clearAuthCookie(headers);

  if (isApiRequest(ctx.url.pathname)) {
    headers.set("Content-Type", "application/json");
    return new Response(
      JSON.stringify({ error: "Unauthorized: Session expired" }),
      {
        status: 401,
        headers,
      },
    );
  }

  // Redirect to login page
  headers.set("Location", "/login");
  return new Response(null, {
    status: 302,
    headers,
  });
}

/**
 * Handles access denied (user not in allow list or in deny list).
 * - For API requests: returns 403 Forbidden
 * - For page requests: redirects to access denied page
 */
function handleAccessDenied(ctx: { url: URL }): Response {
  if (isApiRequest(ctx.url.pathname)) {
    return Response.json(
      {
        error: "Forbidden: User is not authorized to access this application",
      },
      { status: 403 },
    );
  }

  // Redirect to access denied page
  return new Response(null, {
    status: 302,
    headers: {
      "Location": "/access-denied",
    },
  });
}

export const handler = define.middleware(async (ctx) => {
  // Public routes - allow without auth
  if (isPublicPath(ctx.url.pathname)) {
    ctx.state.auth = { isAuthenticated: false, userPubkey: null };
    return await ctx.next();
  }

  // Read pubkey from cookie
  const pubkey = getAuthCookie(ctx.req);

  // No cookie → redirect to login (for pages) or 401 (for API)
  if (!pubkey) {
    return handleUnauthenticated(ctx);
  }

  // Validate session exists in Valkey
  const sessionManager = AppServices.instance.sessionManager;
  const sessionExists = await sessionManager.sessionExists(pubkey);
  if (!sessionExists) {
    // Session expired/invalid → clear cookie, redirect to login
    return handleSessionExpired(ctx);
  }

  // Check user access control
  const accessControl = UserAccessControlService.create();
  if (!accessControl.isUserAllowed(pubkey)) {
    return handleAccessDenied(ctx);
  }

  // Set auth context in state
  ctx.state.auth = { isAuthenticated: true, userPubkey: pubkey };
  return await ctx.next();
});
