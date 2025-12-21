/**
 * Keepalive Service
 *
 * Manages session liveness by periodically pinging remote signers.
 * Runs a background Web Worker that handles the timing loop, while the
 * main thread handles actual NIP-46 communication.
 *
 * @see ../architecture/SESSIONS.md
 */

import {
  Nip46Connection,
  Nip46Service,
} from "@/features/auth/services/nip46-auth-service.ts";
import { SessionManager } from "@/features/auth/services/session-manager-service.ts";
import { getAuthConfig } from "@/features/config/index.ts";

/**
 * Error thrown when keepalive operations fail.
 */
export class KeepaliveError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "KeepaliveError";
  }
}

/**
 * Message types from the worker.
 */
interface WorkerMessage {
  type: "ping_request" | "session_failed" | "status" | "error";
  payload?: unknown;
}

/**
 * Session connection info needed for ping operations.
 */
interface SessionConnection {
  userPubkey: string;
  connection: Nip46Connection;
}

/**
 * Keepalive Service.
 *
 * Maintains session liveness by coordinating with a background worker
 * that handles timing, while the main thread performs actual NIP-46 pings.
 *
 * @example
 * ```ts
 * const keepalive = new KeepaliveService(nip46Service, sessionManager);
 *
 * // Start the keepalive loop
 * await keepalive.start();
 *
 * // Add a session to monitor after authentication
 * keepalive.trackSession(userPubkey, connection);
 *
 * // Remove when user logs out
 * keepalive.untrackSession(userPubkey);
 *
 * // Stop the service on shutdown
 * keepalive.stop();
 * ```
 */
export class KeepaliveService implements Disposable {
  private nip46Service: Nip46Service;
  private sessionManager: SessionManager;
  private worker: Worker | null = null;
  private sessions: Map<string, SessionConnection> = new Map();
  private isRunning = false;
  private onSessionFailed?: (userPubkey: string, reason: string) => void;

  constructor(
    nip46Service: Nip46Service,
    sessionManager: SessionManager,
    options?: {
      onSessionFailed?: (userPubkey: string, reason: string) => void;
    },
  ) {
    this.nip46Service = nip46Service;
    this.sessionManager = sessionManager;
    this.onSessionFailed = options?.onSessionFailed;
  }

  /**
   * Starts the keepalive service.
   *
   * Creates and starts the background worker that manages the ping loop.
   *
   * @throws {KeepaliveError} If the worker fails to start
   */
  async start(): Promise<void> {
    if (this.isRunning) return;

    try {
      // Create worker
      // AI-NOTE: In Vite SSR builds, workers aren't bundled. We load from source.
      // Use file:// URL to absolute path in source directory
      const workerPath = new URL(
        import.meta.resolve("@/features/auth/services/keepalive-worker.ts"),
      ).href;
      this.worker = new Worker(workerPath, { type: "module" });

      // Set up message handler
      this.worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
        this.handleWorkerMessage(event.data);
      };

      this.worker.onerror = (error) => {
        console.error("[keepalive] Worker error:", error);
      };

      // Wait for worker to be ready
      await this.waitForWorkerReady();

      // Send config to worker
      const authConfig = getAuthConfig();
      this.worker.postMessage({
        type: "init",
        payload: {
          pingIntervalMs: authConfig.keepalive_worker.ping_interval,
          maxConsecutiveFailures: authConfig.keepalive_worker.max_failures,
        },
      });

      // Start the keepalive loop
      this.worker.postMessage({ type: "start" });
      this.isRunning = true;

      // Add existing tracked sessions to worker
      for (const userPubkey of this.sessions.keys()) {
        this.worker.postMessage({
          type: "add_session",
          payload: { userPubkey },
        });
      }
    } catch (error) {
      throw new KeepaliveError("Failed to start keepalive service", {
        cause: error,
      });
    }
  }

  /**
   * Waits for the worker to signal readiness.
   */
  private waitForWorkerReady(): Promise<void> {
    const authConfig = getAuthConfig();
    const readyTimeout = authConfig.keepalive_worker.ready_timeout;

    return new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new KeepaliveError("Worker not created"));
        return;
      }

      const timeout = setTimeout(() => {
        reject(new KeepaliveError("Worker ready timeout"));
      }, readyTimeout);

      const originalHandler = this.worker.onmessage;

      this.worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
        if (
          event.data.type === "status" &&
          event.data.payload &&
          typeof event.data.payload === "object" &&
          "ready" in event.data.payload
        ) {
          clearTimeout(timeout);
          this.worker!.onmessage = originalHandler;
          resolve();
        }
      };
    });
  }

  /**
   * Stops the keepalive service.
   */
  stop(): void {
    if (!this.isRunning) return;

    if (this.worker) {
      this.worker.postMessage({ type: "stop" });
      this.worker.terminate();
      this.worker = null;
    }

    this.isRunning = false;
  }

  /**
   * Adds a session to be monitored by the keepalive service.
   *
   * @param userPubkey - The user's public key
   * @param connection - The NIP-46 connection for pinging
   */
  trackSession(userPubkey: string, connection: Nip46Connection): void {
    this.sessions.set(userPubkey, { userPubkey, connection });

    if (this.worker && this.isRunning) {
      this.worker.postMessage({
        type: "add_session",
        payload: { userPubkey },
      });
    }
  }

  /**
   * Removes a session from monitoring.
   *
   * @param userPubkey - The user's public key
   */
  untrackSession(userPubkey: string): void {
    this.sessions.delete(userPubkey);

    if (this.worker && this.isRunning) {
      this.worker.postMessage({
        type: "remove_session",
        payload: { userPubkey },
      });
    }
  }

  /**
   * Gets all tracked sessions.
   *
   * @returns Array of tracked user public keys
   */
  getTrackedSessions(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Checks if a session is being tracked.
   *
   * @param userPubkey - The user's public key
   * @returns True if the session is tracked
   */
  isTracking(userPubkey: string): boolean {
    return this.sessions.has(userPubkey);
  }

  /**
   * Handles messages from the worker.
   */
  private async handleWorkerMessage(message: WorkerMessage): Promise<void> {
    switch (message.type) {
      case "ping_request":
        await this.handlePingRequest(message.payload as { userPubkey: string });
        break;

      case "session_failed":
        await this.handleSessionFailed(
          message.payload as { userPubkey: string; reason: string },
        );
        break;

      case "status":
        // Log status updates in development
        console.debug("[keepalive] Status:", message.payload);
        break;

      case "error":
        console.error("[keepalive] Worker error:", message.payload);
        break;
    }
  }

  /**
   * Handles a ping request from the worker.
   */
  private async handlePingRequest(
    payload: { userPubkey: string },
  ): Promise<void> {
    const { userPubkey } = payload;
    const sessionInfo = this.sessions.get(userPubkey);

    if (!sessionInfo) {
      // Session was removed, inform worker
      this.worker?.postMessage({
        type: "ping_result",
        payload: { userPubkey, success: false },
      });
      return;
    }

    try {
      const success = await this.nip46Service.ping(sessionInfo.connection);

      this.worker?.postMessage({
        type: "ping_result",
        payload: { userPubkey, success },
      });
    } catch (error) {
      console.error(`[keepalive] Ping failed for ${userPubkey}:`, error);

      this.worker?.postMessage({
        type: "ping_result",
        payload: { userPubkey, success: false },
      });
    }
  }

  /**
   * Handles a session failure notification from the worker.
   */
  private async handleSessionFailed(
    payload: { userPubkey: string; reason: string },
  ): Promise<void> {
    const { userPubkey, reason } = payload;

    console.warn(`[keepalive] Session failed for ${userPubkey}: ${reason}`);

    // Remove from tracking
    this.sessions.delete(userPubkey);

    // Delete session from Valkey
    try {
      await this.sessionManager.deleteSession(userPubkey);
    } catch (error) {
      console.error(
        `[keepalive] Failed to delete session for ${userPubkey}:`,
        error,
      );
    }

    // Notify callback if registered
    if (this.onSessionFailed) {
      this.onSessionFailed(userPubkey, reason);
    }
  }

  /**
   * Symbol.dispose implementation for explicit resource management.
   */
  [Symbol.dispose](): void {
    this.stop();
  }
}

/**
 * Creates a new keepalive service instance.
 *
 * @param nip46Service - The NIP-46 service for sending pings
 * @param sessionManager - The session manager for deleting failed sessions
 * @param options - Optional configuration
 * @returns A new KeepaliveService instance
 */
export function createKeepaliveService(
  nip46Service: Nip46Service,
  sessionManager: SessionManager,
  options?: {
    onSessionFailed?: (userPubkey: string, reason: string) => void;
  },
): KeepaliveService {
  return new KeepaliveService(nip46Service, sessionManager, options);
}
