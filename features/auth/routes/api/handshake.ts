/**
 * API Route: GET /api/auth/handshake/:connectionId
 *
 * Server-Sent Events stream for handshake completion in client-initiated NIP-46 flow.
 *
 * Events sent:
 * - data: {"status": "pending"} - Initial connection established
 * - data: {"status": "completed", "userPubkey": string} - Handshake succeeded
 * - data: {"status": "timeout", "error": string} - Handshake timed out
 * - data: {"status": "error", "error": string} - Handshake failed
 */

import type { Context } from "fresh";
import type { State } from "@/utils.ts";
import { AppServices } from "@/shared/app-services.ts";
import {
  getPendingConnection,
  removePendingConnection,
} from "./nostrconnect.ts";
import {
  type Nip46Connection,
} from "@/features/auth/services/nip46-auth-service.ts";
import { NID } from "@/shared/nostr/events-schema.ts";
import {
  createUserAccessControl,
} from "@/features/auth/user-access-control.ts";
import { HandshakeEventCallback } from "../../services/handshake-service.ts";

// AI-NOTE: Timeout and polling logic removed - handshake monitoring now uses
// persistent relay subscriptions via HandshakeService. Cleanup happens naturally
// when client disconnects SSE stream.

/**
 * Helper to send SSE event through a ReadableStreamDefaultController
 */
function sendEvent(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  data: unknown,
): void {
  controller.enqueue(
    encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
  );
}

/**
 * Helper to close the stream controller
 */
function closeConnection(
  controller: ReadableStreamDefaultController,
): void {
  try {
    controller.close();
  } catch {
    // Connection may already be closed
  }
}

/**
 * Handle successful handshake - check access control, create session, and send completion event
 */
async function handleHandshakeSuccess(
  connectionId: string,
  userPubkey: NID,
  connection: Nip46Connection,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
): Promise<void> {
  // Check user access control before creating session
  const accessControl = createUserAccessControl();
  if (!accessControl.isUserAllowed(userPubkey)) {
    // Clean up pending connection
    removePendingConnection(connectionId);

    // Send access denied error
    sendEvent(controller, encoder, {
      status: "error",
      error: "Access denied: User is not authorized to access this application",
    });

    // Close the connection
    closeConnection(controller);
    return;
  }

  const services = AppServices.instance;
  const sessionManager = services.sessionManager;
  const keepaliveService = services.keepaliveService;

  // Create session and start tracking
  await sessionManager.createSession(connection, userPubkey);
  keepaliveService.trackSession(userPubkey, connection);

  // Clean up pending connection
  removePendingConnection(connectionId);

  // Send success event
  sendEvent(controller, encoder, {
    status: "completed",
    userPubkey,
  });

  // Close the connection
  closeConnection(controller);
}

/**
 * Handle handshake failure - send error event and clean up
 */
function handleHandshakeError(
  connectionId: string,
  error: unknown,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
): void {
  removePendingConnection(connectionId);
  sendEvent(controller, encoder, {
    status: "error",
    error: error instanceof Error ? error.message : "Handshake failed",
  });
  closeConnection(controller);
}

/**
 * Initialize handshake stream - validate connection and start monitoring via HandshakeService
 */
function initializeHandshakeStream(
  connectionId: string,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
): void {
  // Retrieve pending connection data
  const pendingData = getPendingConnection(connectionId);
  if (!pendingData) {
    sendEvent(controller, encoder, {
      status: "error",
      error: "Invalid or expired connection ID",
    });
    closeConnection(controller);
    return;
  }

  // Send initial pending status
  sendEvent(controller, encoder, { status: "pending" });

  const handshakeCallback: HandshakeEventCallback = async (
    connId,
    result,
    error,
  ) => {
    if (error) {
      handleHandshakeError(connId, error, controller, encoder);
    } else if (result) {
      await handleHandshakeSuccess(
        connId,
        result.userPubkey,
        result.connection,
        controller,
        encoder,
      );
    }
  };

  const services = AppServices.instance;
  services.handshakeService.startHandshake(
    connectionId,
    pendingData,
    handshakeCallback,
  );
}

export function handshakeHandler(ctx: Context<State>): Response {
  const { connectionId } = ctx.params;

  const body = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      try {
        initializeHandshakeStream(
          connectionId,
          controller,
          encoder,
        );
      } catch (error) {
        sendEvent(controller, encoder, {
          status: "error",
          error: error instanceof Error ? error.message : "Unknown error",
        });
        closeConnection(controller);
      }

      // Clean up on client disconnect
      ctx.req.signal.addEventListener("abort", () => {
        const services = AppServices.instance;
        services.handshakeService.cancelHandshake(connectionId);
        closeConnection(controller);
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
