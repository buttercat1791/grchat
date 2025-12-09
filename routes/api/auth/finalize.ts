/**
 * API Route: POST /api/auth/finalize
 *
 * Finalizes authentication after SSE handshake completion by setting the auth cookie.
 * The SSE stream cannot set cookies mid-stream, so this endpoint is called by the client
 * after the handshake completes to set the authentication cookie.
 *
 * Request body:
 * {
 *   userPubkey: string;
 * }
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
import { UserAccessControlService } from "@/features/auth/user-access-control.ts";
import { setAuthCookie } from "@/features/auth/auth-cookie.ts";
import { NIDSchema } from "@/shared/nostr/events-schema.ts";

export default define.handlers({
  async POST(ctx) {
    try {
      const body = await ctx.req.json();
      const { userPubkey } = body;

      // Validate request
      if (!userPubkey || typeof userPubkey !== "string") {
        return Response.json(
          {
            error: "userPubkey is required and must be a string",
          },
          { status: 400 },
        );
      }

      // Validate pubkey format
      let validatedPubkey;
      try {
        validatedPubkey = NIDSchema.parse(userPubkey);
      } catch (error) {
        return Response.json(
          {
            error: "Invalid pubkey format",
          },
          { status: 400 },
        );
      }

      // Verify session exists in Valkey
      const sessionManager = AppServices.instance.sessionManager;
      const sessionExists = await sessionManager.sessionExists(validatedPubkey);
      if (!sessionExists) {
        return Response.json(
          {
            error: "Session not found or expired",
          },
          { status: 401 },
        );
      }

      // Check user access control
      const accessControl = UserAccessControlService.create();
      if (!accessControl.isUserAllowed(validatedPubkey)) {
        return Response.json(
          {
            error:
              "Access denied: User is not authorized to access this application",
          },
          { status: 403 },
        );
      }

      // Set authentication cookie
      const headers = new Headers({
        "Content-Type": "application/json",
      });
      setAuthCookie(headers, validatedPubkey);

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
