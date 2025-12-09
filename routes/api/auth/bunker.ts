/**
 * API Route: POST /api/auth/bunker
 *
 * Submit bunker:// URL for signer-initiated NIP-46 authentication flow. Attempts to create a user
 * session on the server as a side effect.
 *
 * Request body:
 * {
 *   bunkerUrl: string;
 * }
 *
 * Response (201 Created):
 * {
 *   userPubkey: string;
 *   status: string;
 *   _links: {
 *     self: { href: string, title: string },
 *     session: { href: string, title: string }
 *   }
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

export default define.handlers({
  async POST(ctx) {
    try {
      const body = await ctx.req.json();
      const { bunkerUrl } = body;

      // Validate request
      if (!bunkerUrl || typeof bunkerUrl !== "string") {
        return Response.json(
          {
            error: "bunkerUrl is required and must be a string",
          },
          { status: 400 },
        );
      }

      // Validate bunker URL format
      if (!bunkerUrl.startsWith("bunker://")) {
        return Response.json(
          {
            error: "Invalid bunker URL format. URL must start with 'bunker://'",
          },
          { status: 400 },
        );
      }

      const services = AppServices.instance;
      const nip46Service = services.nip46Service;
      const sessionManager = services.sessionManager;
      const keepaliveService = services.keepaliveService;

      // Parse bunker URL
      let connection;
      try {
        connection = nip46Service.parseBunkerUrl(bunkerUrl);
      } catch (error) {
        return Response.json(
          {
            error: error instanceof Error
              ? `Failed to parse bunker URL: ${error.message}`
              : "Failed to parse bunker URL",
          },
          { status: 400 },
        );
      }

      // Complete handshake
      let userPubkey;
      let fullConnection;
      try {
        const result = await nip46Service.completeHandshake(connection);
        userPubkey = result.userPubkey;
        fullConnection = result.connection;
      } catch (error) {
        return Response.json(
          {
            error: error instanceof Error
              ? `Handshake failed: ${error.message}`
              : "Handshake failed",
          },
          { status: 500 },
        );
      }

      // Check user access control
      const accessControl = UserAccessControlService.create();
      if (!accessControl.isUserAllowed(userPubkey)) {
        return Response.json(
          {
            error:
              "Access denied: User is not authorized to access this application",
          },
          { status: 403 },
        );
      }

      // Create session
      try {
        await sessionManager.createSession(fullConnection, userPubkey);
      } catch (error) {
        return Response.json(
          {
            error: error instanceof Error
              ? `Failed to create session: ${error.message}`
              : "Failed to create session",
          },
          { status: 500 },
        );
      }

      // Start tracking for keepalive
      keepaliveService.trackSession(userPubkey, fullConnection);

      const sessionUri = `/api/auth/session/${userPubkey}`;

      const response = {
        userPubkey,
        status: "authenticated",
        _links: {
          self: {
            href: "/api/auth/bunker",
            title: "Submit bunker URL for signer-initiated authentication",
          },
          session: {
            href: sessionUri,
            title: "Access session details",
          },
        },
      };

      // Set authentication cookie
      const headers = new Headers({
        "Content-Type": "application/hal+json",
        "Location": sessionUri,
      });
      setAuthCookie(headers, userPubkey);

      return new Response(
        JSON.stringify(response),
        {
          status: 201,
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
