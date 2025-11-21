/**
 * WebSocket Connection Pool for Nostr Relays
 *
 * Manages pooled WebSocket connections to Nostr relays for efficient reuse across
 * NIP-46 remote signing operations.
 */

import { z } from "zod";
import { NostrEvent } from "@/schemas/nostr.ts";

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
 * NIP-01 client-to-relay message types.
 */
type ClientMessage =
  | ["EVENT", z.infer<typeof NostrEvent>]
  | ["REQ", string, ...Record<string, unknown>[]]
  | ["CLOSE", string];

/**
 * NIP-01 relay-to-client message types.
 */
type RelayMessage =
  | ["EVENT", string, z.infer<typeof NostrEvent>]
  | ["EOSE", string]
  | ["OK", string, boolean, string]
  | ["NOTICE", string]
  | ["AUTH", string];

/**
 * Subscription callback function.
 */
type SubscriptionCallback = (event: z.infer<typeof NostrEvent>) => void;

/**
 * Message handler for relay messages.
 */
type MessageHandler = (message: RelayMessage) => void;

/**
 * Connection state for a relay.
 */
interface RelayConnection {
  url: string;
  socket: WebSocket;
  state: "connecting" | "connected" | "disconnected";
  subscriptions: Map<string, SubscriptionCallback>;
  messageHandlers: Set<MessageHandler>;
  reconnectAttempts: number;
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
  /** Maximum reconnection attempts */
  maxReconnectAttempts?: number;
  /** Reconnection delay in milliseconds */
  reconnectDelay?: number;
  /** Idle timeout before closing connection in milliseconds */
  idleTimeout?: number;
}

const DEFAULT_CONFIG: Required<RelayPoolConfig> = {
  maxConnectionsPerRelay: 3,
  connectionTimeout: 10000,
  maxReconnectAttempts: 5,
  reconnectDelay: 1000,
  idleTimeout: 300000, // 5 minutes
};

/**
 * WebSocket connection pool for Nostr relays.
 *
 * Manages multiple WebSocket connections to relay servers, handling:
 * - Connection pooling and reuse
 * - Automatic reconnection on failure
 * - Subscription management
 * - Message routing
 *
 * @example
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
  private connections: Map<string, RelayConnection> = new Map();
  private config: Required<RelayPoolConfig>;
  private isClosed = false;

  constructor(config?: RelayPoolConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
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
    this.assertNotClosed();

    const normalizedUrl = this.normalizeUrl(url);

    // Return if already connected
    const existing = this.connections.get(normalizedUrl);
    if (existing && existing.state === "connected") {
      existing.lastActivity = Date.now();
      return;
    }

    // Create new connection
    const connection = await this.createConnection(normalizedUrl);
    this.connections.set(normalizedUrl, connection);
  }

  /**
   * Creates a new WebSocket connection to a relay.
   */
  private createConnection(url: string): Promise<RelayConnection> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      const connection: RelayConnection = {
        url,
        socket,
        state: "connecting",
        subscriptions: new Map(),
        messageHandlers: new Set(),
        reconnectAttempts: 0,
        lastActivity: Date.now(),
      };

      const timeout = setTimeout(() => {
        socket.close();
        reject(new RelayError(`Connection to ${url} timed out`));
      }, this.config.connectionTimeout);

      socket.onopen = () => {
        clearTimeout(timeout);
        connection.state = "connected";
        connection.reconnectAttempts = 0;
        resolve(connection);
      };

      socket.onerror = (error) => {
        clearTimeout(timeout);
        connection.state = "disconnected";
        reject(new RelayError(`Connection to ${url} failed`, { cause: error }));
      };

      socket.onclose = () => {
        connection.state = "disconnected";
        this.handleDisconnect(connection);
      };

      socket.onmessage = (event) => {
        connection.lastActivity = Date.now();
        this.handleMessage(connection, event.data);
      };
    });
  }

  /**
   * Handles incoming messages from a relay.
   */
  private handleMessage(connection: RelayConnection, data: string): void {
    try {
      const message = JSON.parse(data) as RelayMessage;

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
   * Handles disconnection from a relay.
   */
  private handleDisconnect(connection: RelayConnection): void {
    if (this.isClosed) return;

    // Attempt reconnection if we haven't exceeded max attempts
    if (connection.reconnectAttempts < this.config.maxReconnectAttempts) {
      connection.reconnectAttempts++;
      const delay = this.config.reconnectDelay * connection.reconnectAttempts;

      setTimeout(async () => {
        try {
          const newConnection = await this.createConnection(connection.url);
          // Restore subscriptions
          newConnection.subscriptions = connection.subscriptions;
          newConnection.messageHandlers = connection.messageHandlers;
          this.connections.set(connection.url, newConnection);

          // Resubscribe to all active subscriptions
          for (const subId of newConnection.subscriptions.keys()) {
            // Note: We would need to store filter info to properly resubscribe
            // For now, subscriptions may need to be re-established by callers
          }
        } catch {
          // Will try again on next disconnect event
        }
      }, delay);
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
    filters: Record<string, unknown>[],
    callback: SubscriptionCallback,
  ): Promise<string> {
    this.assertNotClosed();

    const normalizedUrl = this.normalizeUrl(url);
    await this.connect(normalizedUrl);

    const connection = this.connections.get(normalizedUrl);
    if (!connection || connection.state !== "connected") {
      throw new RelayError(`Not connected to ${url}`);
    }

    const subId = crypto.randomUUID();
    connection.subscriptions.set(subId, callback);

    const message: ClientMessage = ["REQ", subId, ...filters];
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
    this.assertNotClosed();

    const normalizedUrl = this.normalizeUrl(url);
    const connection = this.connections.get(normalizedUrl);
    if (!connection) return;

    connection.subscriptions.delete(subId);

    if (connection.state === "connected") {
      const message: ClientMessage = ["CLOSE", subId];
      connection.socket.send(JSON.stringify(message));
    }
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
    this.assertNotClosed();

    const normalizedUrl = this.normalizeUrl(url);
    await this.connect(normalizedUrl);

    const connection = this.connections.get(normalizedUrl);
    if (!connection || connection.state !== "connected") {
      throw new RelayError(`Not connected to ${url}`);
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        connection.messageHandlers.delete(handler);
        reject(new RelayError(`Publish to ${url} timed out`));
      }, this.config.connectionTimeout);

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

      const clientMessage: ClientMessage = ["EVENT", event];
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
    this.assertNotClosed();

    const normalizedUrl = this.normalizeUrl(url);
    const connection = this.connections.get(normalizedUrl);
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
    const normalizedUrl = this.normalizeUrl(url);
    const connection = this.connections.get(normalizedUrl);
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
    const normalizedUrl = this.normalizeUrl(url);
    const connection = this.connections.get(normalizedUrl);
    if (connection) {
      connection.socket.close();
      this.connections.delete(normalizedUrl);
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
    const normalizedUrl = this.normalizeUrl(url);
    return this.connections.get(normalizedUrl)?.state;
  }

  /**
   * Gets all connected relay URLs.
   *
   * @returns Array of connected relay URLs
   */
  getConnectedRelays(): string[] {
    return Array.from(this.connections.entries())
      .filter(([_, conn]) => conn.state === "connected")
      .map(([url, _]) => url);
  }

  /**
   * Closes all connections and cleans up resources.
   */
  close(): void {
    if (this.isClosed) return;

    this.isClosed = true;

    for (const connection of this.connections.values()) {
      connection.socket.close();
    }

    this.connections.clear();
  }

  /**
   * Normalizes a relay URL to ensure consistent key usage.
   */
  private normalizeUrl(url: string): string {
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
  private assertNotClosed(): void {
    if (this.isClosed) {
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
export function createRelayPool(config?: RelayPoolConfig): RelayPool {
  return new RelayPool(config);
}
