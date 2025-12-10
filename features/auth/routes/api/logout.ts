/**
 * API Route: POST /api/auth/logout
 *
 * Handles user logout by:
 * - Deleting the session from Valkey
 * - Stopping keepalive tracking
 * - Clearing the auth cookie
 *
 * Response (200 OK):
 * {
 *   status: "success";
 *   _links: {
 *     self: { href: string, title: string },
 *     nostrconnect: { href: string, title: string },
 *     bunker: { href: string, title: string }
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
import { clearAuthCookie, getAuthCookie } from "@/features/auth/auth-cookie.ts";

export async function logoutHandler(
  ctx: Context<State>,
): Promise<Response> {
  try {
    // Get pubkey from cookie
    const pubkey = getAuthCookie(ctx.req);

    if (!pubkey) {
      return Response.json(
        {
          error: "Not authenticated",
        },
        { status: 401 },
      );
    }

    const services = AppServices.instance;
    const sessionManager = services.sessionManager;
    const keepaliveService = services.keepaliveService;

    // Stop keepalive tracking
    keepaliveService.untrackSession(pubkey);

    // Delete session from Valkey
    try {
      await sessionManager.deleteSession(pubkey);
    } catch (error) {
      // Log error but continue - session may already be expired
      console.warn(
        `[logout] Failed to delete session for ${pubkey}:`,
        error,
      );
    }

    // Clear auth cookie
    const headers = new Headers({
      "Content-Type": "application/hal+json",
    });
    clearAuthCookie(headers);

    const response = {
      status: "success",
      _links: {
        self: {
          href: "/api/auth/logout",
          title: "Log out and terminate session",
        },
        nostrconnect: {
          href: "/api/auth/nostrconnect",
          title:
            "Authenticate with nostrconnect URL (client-initiated auth flow)",
        },
        bunker: {
          href: "/api/auth/bunker",
          title: "Authenticate with bunker URL (signer-initiated auth flow)",
        },
      },
    };

    return new Response(
      JSON.stringify(response),
      {
        status: 200,
        headers,
      },
    );
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
