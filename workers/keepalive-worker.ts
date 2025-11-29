/**
 * Keepalive Worker
 *
 * Background Web Worker that sends periodic ping messages to remote signers
 * to maintain session liveness.
 *
 * This worker runs independently of the main thread and communicates via
 * postMessage.
 *
 * @see https://docs.deno.com/api/web/~/Worker
 */

/**
 * Message types sent from main thread to worker.
 */
interface WorkerInboundMessage {
  type: "start" | "stop" | "add_session" | "remove_session" | "ping_result";
  payload?: unknown;
}

/**
 * Message types sent from worker to main thread.
 */
interface WorkerOutboundMessage {
  type: "ping_request" | "session_failed" | "status" | "error";
  payload?: unknown;
}

/**
 * Session tracking information.
 */
interface TrackedSession {
  userPubkey: string;
  lastPingAt: number;
  lastPongAt: number | null;
  consecutiveFailures: number;
}

// Worker state
let isRunning = false;
let pingInterval: number | null = null;
const sessions: Map<string, TrackedSession> = new Map();

// Configuration
const PING_INTERVAL_MS = 60000; // 60 seconds
const MAX_CONSECUTIVE_FAILURES = 3;

/**
 * Sends a message to the main thread.
 */
function sendMessage(message: WorkerOutboundMessage): void {
  self.postMessage(message);
}

/**
 * Handles the ping cycle for all tracked sessions.
 */
function handlePingCycle(): void {
  const now = Date.now();

  for (const [userPubkey, session] of sessions.entries()) {
    // Check if we've exceeded failure threshold
    if (session.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      sendMessage({
        type: "session_failed",
        payload: {
          userPubkey,
          reason: "max_failures_exceeded",
          failures: session.consecutiveFailures,
        },
      });
      sessions.delete(userPubkey);
      continue;
    }

    // Request ping from main thread (which has access to NIP-46 service)
    session.lastPingAt = now;
    sendMessage({
      type: "ping_request",
      payload: { userPubkey },
    });
  }

  // Send status update
  sendMessage({
    type: "status",
    payload: {
      activeSessions: sessions.size,
      isRunning,
    },
  });
}

/**
 * Starts the keepalive loop.
 */
function start(): void {
  if (isRunning) return;

  isRunning = true;
  pingInterval = setInterval(handlePingCycle, PING_INTERVAL_MS);

  sendMessage({
    type: "status",
    payload: { isRunning: true, activeSessions: sessions.size },
  });
}

/**
 * Stops the keepalive loop.
 */
function stop(): void {
  if (!isRunning) return;

  isRunning = false;

  if (pingInterval !== null) {
    clearInterval(pingInterval);
    pingInterval = null;
  }

  sendMessage({
    type: "status",
    payload: { isRunning: false, activeSessions: sessions.size },
  });
}

/**
 * Adds a session to track.
 */
function addSession(userPubkey: string): void {
  if (sessions.has(userPubkey)) return;

  sessions.set(userPubkey, {
    userPubkey,
    lastPingAt: 0,
    lastPongAt: null,
    consecutiveFailures: 0,
  });

  sendMessage({
    type: "status",
    payload: {
      activeSessions: sessions.size,
      added: userPubkey,
    },
  });
}

/**
 * Removes a session from tracking.
 */
function removeSession(userPubkey: string): void {
  sessions.delete(userPubkey);

  sendMessage({
    type: "status",
    payload: {
      activeSessions: sessions.size,
      removed: userPubkey,
    },
  });
}

/**
 * Handles ping result from main thread.
 */
function handlePingResult(userPubkey: string, success: boolean): void {
  const session = sessions.get(userPubkey);
  if (!session) return;

  if (success) {
    session.lastPongAt = Date.now();
    session.consecutiveFailures = 0;
  } else {
    session.consecutiveFailures++;

    // Check if we should terminate this session
    if (session.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      sendMessage({
        type: "session_failed",
        payload: {
          userPubkey,
          reason: "max_failures_exceeded",
          failures: session.consecutiveFailures,
        },
      });
      sessions.delete(userPubkey);
    }
  }
}

// Message handler
self.onmessage = (event: MessageEvent<WorkerInboundMessage>) => {
  const { type, payload } = event.data;

  try {
    switch (type) {
      case "start":
        start();
        break;

      case "stop":
        stop();
        break;

      case "add_session":
        if (payload && typeof payload === "object" && "userPubkey" in payload) {
          addSession((payload as { userPubkey: string }).userPubkey);
        }
        break;

      case "remove_session":
        if (payload && typeof payload === "object" && "userPubkey" in payload) {
          removeSession((payload as { userPubkey: string }).userPubkey);
        }
        break;

      case "ping_result":
        if (
          payload &&
          typeof payload === "object" &&
          "userPubkey" in payload &&
          "success" in payload
        ) {
          const { userPubkey, success } = payload as {
            userPubkey: string;
            success: boolean;
          };
          handlePingResult(userPubkey, success);
        }
        break;

      default:
        sendMessage({
          type: "error",
          payload: { message: `Unknown message type: ${type}` },
        });
    }
  } catch (error) {
    sendMessage({
      type: "error",
      payload: {
        message: error instanceof Error ? error.message : "Unknown error",
      },
    });
  }
};

// Signal that worker is ready
sendMessage({
  type: "status",
  payload: { isRunning: false, activeSessions: 0, ready: true },
});
