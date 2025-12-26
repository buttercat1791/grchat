/**
 * API Route: GET /api/auth/session/status
 *
 * Server-Sent Events stream for session status notifications.
 * Clients connect to this endpoint to receive real-time notifications
 * when their session expires or becomes invalid.
 *
 * Events sent:
 * - data: {"type": "connected"} - Initial connection established
 * - data: {"type": "session_expired", "reason": string} - Session has expired
 */

import type { Context } from "fresh";
import type { State } from "@/utils.ts";
import { AppServices } from "@/shared/app-services.ts";
import { getAuthCookie } from "@/features/auth/auth-cookie.ts";

export function sessionStatusHandler(ctx: Context<State>): Response {
  // Get pubkey from auth cookie
  const pubkey = getAuthCookie(ctx.req);

  if (!pubkey) {
    return Response.json(
      {
        error: "Authentication required",
      },
      { status: 401 },
    );
  }

  const services = AppServices.instance;
  const sessionManager = services.sessionManager;

  // Create SSE stream
  const body = new ReadableStream({
    start(controller) {
      // Register this client for session status notifications
      const cleanup = sessionManager.registerClient(pubkey, controller);

      // Clean up when client disconnects
      ctx.req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {
          // Connection may already be closed
        }
      });
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
