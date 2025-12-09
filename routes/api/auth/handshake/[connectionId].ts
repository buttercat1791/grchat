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

import { define } from "@/utils.ts";
import { AppServices } from "@/shared/app-services.ts";
import {
  getPendingConnection,
  removePendingConnection,
} from "@/routes/api/auth/nostrconnect.ts";
import type { PendingConnectionData } from "@/features/auth/pending-connection-schema.ts";
import {
  type HandshakeResult,
  HandshakeResultSchema,
  type Nip46Connection,
} from "@/features/auth/nip46-auth-service.ts";
import { NID } from "@/shared/nostr/events-schema.ts";
import { getAuthConfig } from "@/features/config/config-provider.ts";

// Configuration values are loaded synchronously from cache
const authConfig = getAuthConfig();
const HANDSHAKE_TIMEOUT = authConfig.nip46_handshake.handshake_expiration;
const CHECK_INTERVAL = authConfig.nip46_handshake.polling_interval;

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
 * Helper to clean up intervals, timeouts, and close the stream controller
 */
function closeConnection(
  controller: ReadableStreamDefaultController,
  intervalId?: number,
  timeoutId?: number,
): void {
  if (intervalId !== undefined) {
    clearInterval(intervalId);
  }
  if (timeoutId !== undefined) {
    clearTimeout(timeoutId);
  }
  try {
    controller.close();
  } catch {
    // Connection may already be closed
  }
}

/**
 * Handle timeout event - send timeout message and clean up
 */
function handleTimeout(
  connectionId: string,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  intervalId?: number,
): void {
  removePendingConnection(connectionId);
  sendEvent(controller, encoder, {
    status: "timeout",
    error: "Handshake timeout exceeded",
  });
  closeConnection(controller, intervalId);
}

/**
 * Handle successful handshake - create session and send completion event
 */
async function handleHandshakeSuccess(
  connectionId: string,
  userPubkey: NID,
  connection: Nip46Connection,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  intervalId?: number,
  timeoutId?: number,
): Promise<void> {
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
  closeConnection(controller, intervalId, timeoutId);
}

/**
 * Handle handshake failure - send error event and clean up
 */
function handleHandshakeError(
  connectionId: string,
  error: unknown,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  intervalId?: number,
  timeoutId?: number,
): void {
  removePendingConnection(connectionId);
  sendEvent(controller, encoder, {
    status: "error",
    error: error instanceof Error ? error.message : "Handshake failed",
  });
  closeConnection(controller, intervalId, timeoutId);
}

/**
 * Poll for handshake completion - check if handshake has completed
 * Returns true if handshake completed successfully
 */
async function checkHandshake(
  pendingData: PendingConnectionData,
  startTime: number,
): Promise<HandshakeResult | null> {
  // Check if we're past the timeout threshold
  const elapsed = Date.now() - startTime;
  if (elapsed > HANDSHAKE_TIMEOUT) {
    return null; // Let the timeout handler deal with this
  }

  const services = AppServices.instance;
  const nip46Service = services.nip46Service;

  try {
    // Attempt handshake with short timeout
    const result = await nip46Service.awaitHandshake(
      pendingData.connection,
      100, // Short timeout - just check if handshake already completed
    );
    const res = HandshakeResultSchema.parse(result);

    return res;
  } catch (error) {
    // AI-NOTE: Timeout errors are expected during polling - handshake not yet complete
    if (error instanceof Error && error.message.includes("timeout")) {
      return null; // Continue polling
    }
    // Re-throw other errors
    throw error;
  }
}

/**
 * Set up handshake polling interval
 */
function setupHandshakePolling(
  connectionId: string,
  pendingData: PendingConnectionData,
  startTime: number,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  timeoutId: number,
): number {
  return setInterval(async () => {
    try {
      const result = await checkHandshake(pendingData, startTime);

      if (result) {
        // Handshake successful!
        await handleHandshakeSuccess(
          connectionId,
          result.userPubkey,
          result.connection,
          controller,
          encoder,
          undefined, // intervalId will be cleared by handleHandshakeSuccess
          timeoutId,
        );
      }
      // If result is null, continue polling
    } catch (error) {
      // Other errors indicate failure
      handleHandshakeError(
        connectionId,
        error,
        controller,
        encoder,
        undefined, // intervalId will be cleared by handleHandshakeError
        timeoutId,
      );
    }
  }, CHECK_INTERVAL);
}

/**
 * Initialize handshake stream - validate connection and set up polling
 */
function initializeHandshakeStream(
  connectionId: string,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
): { intervalId: number; timeoutId: number } | null {
  // Retrieve pending connection data
  const pendingData = getPendingConnection(connectionId);
  if (!pendingData) {
    sendEvent(controller, encoder, {
      status: "error",
      error: "Invalid or expired connection ID",
    });
    closeConnection(controller);
    return null;
  }

  // Send initial pending status
  sendEvent(controller, encoder, { status: "pending" });

  // Set up timeout handler
  const startTime = Date.now();
  const timeoutId = setTimeout(() => {
    handleTimeout(connectionId, controller, encoder);
  }, HANDSHAKE_TIMEOUT);

  // Set up polling interval
  const intervalId = setupHandshakePolling(
    connectionId,
    pendingData,
    startTime,
    controller,
    encoder,
    timeoutId,
  );

  return { intervalId, timeoutId };
}

export default define.handlers({
  GET(ctx) {
    const { connectionId } = ctx.params;

    const body = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        let intervalId: number | undefined;
        let timeoutId: number | undefined;

        try {
          const timers = initializeHandshakeStream(
            connectionId,
            controller,
            encoder,
          );

          if (timers) {
            intervalId = timers.intervalId;
            timeoutId = timers.timeoutId;
          }
        } catch (error) {
          sendEvent(controller, encoder, {
            status: "error",
            error: error instanceof Error ? error.message : "Unknown error",
          });
          closeConnection(controller, intervalId, timeoutId);
        }

        // Clean up on client disconnect
        ctx.req.signal.addEventListener("abort", () => {
          closeConnection(controller, intervalId, timeoutId);
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
  },
});
