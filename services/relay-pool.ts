/**
 * WebSocket Connection Pool for Nostr Relays
 */

import { z } from "zod";
import { NostrEvent } from "@/schemas/nostr-events.ts";
import {
  ClientCloseMessage,
  ClientEventMessage,
  NostrFilter,
  RelayMessage,
} from "../schemas/nostr-messages.ts";

/**
 * Error thrown when relay operations fail.
 */
export class RelayError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "RelayError";
  }
}

/**
 * Subscription callback function.
 */
type SubscriptionCallback = (event: z.infer<typeof NostrEvent>) => void;

/**
 * Message handler for relay messages.
 */
type MessageHandler = (message: z.infer<typeof RelayMessage>) => void;

/**
 * Connection state for a relay.
 */
interface RelayConnection {
  url: string;
  socket: WebSocket;
  state: "connecting" | "connected" | "disconnected";
  subscriptions: Map<string, SubscriptionCallback>;
  messageHandlers: Set<MessageHandler>;
  lastActivity: number;
}

/**
 * Configuration options for the relay pool.
 */
interface RelayPoolConfig {
  /** Maximum number of connections per relay URL */
  maxConnectionsPerRelay?: number;
  /** Connection timeout in milliseconds */
  connectionTimeout?: number;
  /** Idle timeout before closing connection in milliseconds */
  idleTimeout?: number;
}

const DEFAULT_CONFIG: Required<RelayPoolConfig> = {
  maxConnectionsPerRelay: 3,
  connectionTimeout: 10000,
  idleTimeout: 300000, // 5 minutes
};

/**
 * WebSocket connection pool for Nostr relays.
 *
 * Example usage:
 * ```ts
 * const pool = new RelayPool();
 *
 * // Connect to a relay
 * await pool.connect("wss://relay.example.com");
 *
 * // Subscribe to events
 * const subId = await pool.subscribe(
 *   "wss://relay.example.com",
 *   [{ kinds: [24133], "#p": [myPubkey] }],
 *   (event) => console.log("Received:", event)
 * );
 *
 * // Publish an event
 * await pool.publish("wss://relay.example.com", signedEvent);
 *
 * // Clean up
 * pool.close();
 * ```
 */
export class RelayPool implements Disposable {
  #connections: Map<string, RelayConnection> = new Map();
  #config: Required<RelayPoolConfig>;
  #isClosed = false;

  constructor(config?: RelayPoolConfig) {
    this.#config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Connects to a relay if not already connected.
   *
   * @param url - The WebSocket URL of the relay
   * @returns Promise that resolves when connected
   *
   * @throws {RelayError} If connection fails or times out
   */
  async connect(url: string): Promise<void> {
    this.#assertNotClosed();

    const normalizedUrl = this.#normalizeUrl(url);

    // Return if already connected
    const existing = this.#connections.get(normalizedUrl);
    if (existing && existing.state === "connected") {
      existing.lastActivity = Date.now();
      return;
    }

    // Create new connection
    const connection = await this.#createConnection(normalizedUrl);
    this.#connections.set(normalizedUrl, connection);
  }

  /**
   * Creates a new WebSocket connection to a relay.
   */
  #createConnection(url: string): Promise<RelayConnection> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      const connection: RelayConnection = {
        url,
        socket,
        state: "connecting",
        subscriptions: new Map(),
        messageHandlers: new Set(),
        lastActivity: Date.now(),
      };

      const timeout = setTimeout(() => {
        socket.close();
        reject(new RelayError(`Connection to ${url} timed out`));
      }, this.#config.connectionTimeout);

      socket.onopen = () => {
        clearTimeout(timeout);
        connection.state = "connected";
        resolve(connection);
      };

      socket.onerror = (error) => {
        clearTimeout(timeout);
        connection.state = "disconnected";
        reject(new RelayError(`Connection to ${url} failed`, { cause: error }));
      };

      socket.onclose = () => {
        connection.state = "disconnected";
        // AI-NOTE: Currently, we will not attempt to reconnect.
      };

      socket.onmessage = (event) => {
        connection.lastActivity = Date.now();
        this.#handleMessage(connection, event.data);
      };
    });
  }

  /**
   * Handles incoming messages from a relay.
   */
  #handleMessage(connection: RelayConnection, data: string): void {
    try {
      const parsed = JSON.parse(data);
      const result = RelayMessage.safeParse(parsed);

      if (!result.success) {
        console.warn(
          `[relay-pool] Invalid message from ${connection.url}:`,
          result.error.message,
        );
        return;
      }

      const message = result.data;

      // Route to subscription callbacks for EVENT messages
      if (message[0] === "EVENT") {
        const subId = message[1];
        const event = message[2];
        const callback = connection.subscriptions.get(subId);
        if (callback) {
          callback(event);
        }
      }

      // Notify all message handlers
      for (const handler of connection.messageHandlers) {
        handler(message);
      }
    } catch (error) {
      console.error(
        `[relay-pool] Failed to parse message from ${connection.url}:`,
        error,
      );
    }
  }

  /**
   * Subscribes to events matching the given filters.
   *
   * @param url - The relay URL
   * @param filters - Array of NIP-01 filters
   * @param callback - Function called for each matching event
   * @returns The subscription ID
   *
   * @throws {RelayError} If not connected to the relay
   */
  async subscribe(
    url: string,
    filters: z.infer<typeof NostrFilter>[],
    callback: SubscriptionCallback,
  ): Promise<string> {
    this.#assertNotClosed();

    const normalizedUrl = this.#normalizeUrl(url);
    await this.connect(normalizedUrl);

    const connection = this.#connections.get(normalizedUrl);
    if (!connection || connection.state !== "connected") {
      throw new RelayError(`Not connected to ${url}`);
    }

    const subId = crypto.randomUUID();
    connection.subscriptions.set(subId, callback);

    const message = ["REQ", subId, ...filters];
    connection.socket.send(JSON.stringify(message));

    return subId;
  }

  /**
   * Closes a subscription.
   *
   * @param url - The relay URL
   * @param subId - The subscription ID to close
   */
  unsubscribe(url: string, subId: string): void {
    this.#assertNotClosed();

    const normalizedUrl = this.#normalizeUrl(url);
    const connection = this.#connections.get(normalizedUrl);
    if (!connection) return;

    connection.subscriptions.delete(subId);

    if (connection.state === "connected") {
      const message: z.infer<typeof ClientCloseMessage> = ["CLOSE", subId];
      connection.socket.send(JSON.stringify(message));
    }
  }

  /**
   * Fetches a single event matching the given filters.
   *
   * If no events match before EOSE (End of Stored Events), returns null.
   *
   * @param url - The relay URL
   * @param filters - Array of NIP-01 filters
   * @returns The first matching event, or null if no events match
   *
   * @throws {RelayError} If connection fails or times out
   */
  async fetchEvent(
    url: string,
    filters: z.infer<typeof NostrFilter>[],
  ): Promise<z.infer<typeof NostrEvent> | null> {
    this.#assertNotClosed();

    const normalizedUrl = this.#normalizeUrl(url);
    await this.connect(normalizedUrl);

    const connection = this.#connections.get(normalizedUrl);
    if (!connection || connection.state !== "connected") {
      throw new RelayError(`Not connected to ${url}`);
    }

    return new Promise((resolve, reject) => {
      const subId = crypto.randomUUID();

      const cleanup = () => {
        clearTimeout(timeout);
        connection.subscriptions.delete(subId);
        connection.messageHandlers.delete(handler);
        if (connection.state === "connected") {
          const closeMessage: z.infer<typeof ClientCloseMessage> = [
            "CLOSE",
            subId,
          ];
          connection.socket.send(JSON.stringify(closeMessage));
        }
      };

      const timeout = setTimeout(() => {
        cleanup();
        reject(new RelayError(`Fetch from ${url} timed out`));
      }, this.#config.connectionTimeout);

      const handler: MessageHandler = (message) => {
        if (message[0] === "EVENT" && message[1] === subId) {
          cleanup();
          resolve(message[2]);
        } else if (message[0] === "EOSE" && message[1] === subId) {
          cleanup();
          resolve(null);
        }
      };

      connection.subscriptions.set(subId, () => {});
      connection.messageHandlers.add(handler);

      const reqMessage = ["REQ", subId, ...filters];
      connection.socket.send(JSON.stringify(reqMessage));
    });
  }

  /**
   * Publishes an event to a relay.
   *
   * @param url - The relay URL
   * @param event - The signed Nostr event to publish
   * @returns Promise that resolves with the OK response
   *
   * @throws {RelayError} If publish fails
   */
  async publish(
    url: string,
    event: z.infer<typeof NostrEvent>,
  ): Promise<{ success: boolean; message: string }> {
    this.#assertNotClosed();

    const normalizedUrl = this.#normalizeUrl(url);
    await this.connect(normalizedUrl);

    const connection = this.#connections.get(normalizedUrl);
    if (!connection || connection.state !== "connected") {
      throw new RelayError(`Not connected to ${url}`);
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        connection.messageHandlers.delete(handler);
        reject(new RelayError(`Publish to ${url} timed out`));
      }, this.#config.connectionTimeout);

      const handler: MessageHandler = (message) => {
        if (message[0] === "OK" && message[1] === event.id) {
          clearTimeout(timeout);
          connection.messageHandlers.delete(handler);
          resolve({
            success: message[2],
            message: message[3],
          });
        }
      };

      connection.messageHandlers.add(handler);

      const clientMessage: z.infer<typeof ClientEventMessage> = [
        "EVENT",
        event,
      ];
      connection.socket.send(JSON.stringify(clientMessage));
    });
  }

  /**
   * Adds a message handler for a relay connection.
   *
   * @param url - The relay URL
   * @param handler - The message handler function
   */
  addMessageHandler(url: string, handler: MessageHandler): void {
    this.#assertNotClosed();

    const normalizedUrl = this.#normalizeUrl(url);
    const connection = this.#connections.get(normalizedUrl);
    if (connection) {
      connection.messageHandlers.add(handler);
    }
  }

  /**
   * Removes a message handler from a relay connection.
   *
   * @param url - The relay URL
   * @param handler - The message handler function to remove
   */
  removeMessageHandler(url: string, handler: MessageHandler): void {
    const normalizedUrl = this.#normalizeUrl(url);
    const connection = this.#connections.get(normalizedUrl);
    if (connection) {
      connection.messageHandlers.delete(handler);
    }
  }

  /**
   * Disconnects from a specific relay.
   *
   * @param url - The relay URL to disconnect from
   */
  disconnect(url: string): void {
    const normalizedUrl = this.#normalizeUrl(url);
    const connection = this.#connections.get(normalizedUrl);
    if (connection) {
      connection.socket.close();
      this.#connections.delete(normalizedUrl);
    }
  }

  /**
   * Gets the connection state for a relay.
   *
   * @param url - The relay URL
   * @returns The connection state or undefined if not connected
   */
  getState(
    url: string,
  ): "connecting" | "connected" | "disconnected" | undefined {
    const normalizedUrl = this.#normalizeUrl(url);
    return this.#connections.get(normalizedUrl)?.state;
  }

  /**
   * Gets all connected relay URLs.
   *
   * @returns Array of connected relay URLs
   */
  getConnectedRelays(): string[] {
    return Array.from(this.#connections.entries())
      .filter(([_, conn]) => conn.state === "connected")
      .map(([url, _]) => url);
  }

  /**
   * Closes all connections and cleans up resources.
   */
  close(): void {
    if (this.#isClosed) return;

    this.#isClosed = true;

    for (const connection of this.#connections.values()) {
      connection.socket.close();
    }

    this.#connections.clear();
  }

  /**
   * Normalizes a relay URL to ensure consistent key usage.
   */
  #normalizeUrl(url: string): string {
    // Remove trailing slash and normalize to wss
    let normalized = url.replace(/\/$/, "");
    if (normalized.startsWith("ws://")) {
      normalized = "wss://" + normalized.slice(5);
    }
    return normalized;
  }

  /**
   * Ensures the pool hasn't been closed.
   */
  #assertNotClosed(): void {
    if (this.#isClosed) {
      throw new RelayError("RelayPool has been closed");
    }
  }

  /**
   * Symbol.dispose implementation for explicit resource management.
   */
  [Symbol.dispose](): void {
    this.close();
  }
}

/**
 * Creates a new relay pool instance.
 *
 * @param config - Optional configuration options
 * @returns A new RelayPool instance
 */
export function buildRelayPool(config?: RelayPoolConfig): RelayPool {
  return new RelayPool(config);
}
