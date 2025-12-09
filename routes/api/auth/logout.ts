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
 * }
 *
 * Response (error):
 * {
 *   error: string;
 * }
 */

import { define } from "@/utils.ts";
import { AppServices } from "@/shared/app-services.ts";
import { clearAuthCookie, getAuthCookie } from "@/features/auth/auth-cookie.ts";

export default define.handlers({
  async POST(ctx) {
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
        "Content-Type": "application/json",
      });
      clearAuthCookie(headers);

      return new Response(
        JSON.stringify({ status: "success" }),
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
  },
});
