/**
 * Valkey Client Service
 *
 * Wraps the Valkey GLIDE client, manages its lifecycle, and implements custom business logic.
 * Supports explicit resource management via the `using` directive.
 */

import { GlideClient, GlideClientConfiguration } from "@valkey/valkey-glide";

// AI-NOTE: This is a minimal implementation. Add operations as needed for features.

export class ValkeyClient implements Disposable {
  private client: GlideClient | null = null;
  private config: GlideClientConfiguration;

  constructor(config?: Partial<GlideClientConfiguration>) {
    this.config = {
      addresses: [
        {
          host: config?.addresses?.[0]?.host ?? "localhost",
          port: config?.addresses?.[0]?.port ?? 6379,
        },
      ],
      ...config,
    };
  }

  /**
   * Establish connection to Valkey server
   */
  async connect(): Promise<void> {
    if (this.client) {
      throw new Error("Client already connected");
    }
    this.client = await GlideClient.createClient(this.config);
  }

  /**
   * Close connection to Valkey server
   */
  disconnect(): void {
    if (this.client) {
      this.client.close();
      this.client = null;
    }
  }

  /**
   * Check if client is connected
   */
  isConnected(): boolean {
    return this.client !== null;
  }

  /**
   * Get the underlying GLIDE client
   * AI-NOTE: Exposed for direct access when wrapper methods don't exist yet
   */
  getClient(): GlideClient {
    if (!this.client) {
      throw new Error("Client not connected. Call connect() first.");
    }
    return this.client;
  }

  /**
   * Explicit resource management: automatically disconnect when using `using` directive
   */
  [Symbol.dispose](): void {
    this.disconnect();
  }
}

/**
 * Create and return a configured Valkey client instance. The client auto-connects to the Valkey
 * database on creation.
 *
 * Usage:
 * @example
 * // With explicit resource management
 * await using valkey = await createValkeyClient();
 * const client = valkey.getClient();
 * await client.set("key", "value");
 * // Automatically disconnects when scope exits
 *
 * // With manual cleanup
 * const valkey = await createValkeyClient();
 * const client = valkey.getClient();
 * await client.set("key", "value");
 * client.disconnect();
 * // Manually disconnect when no longer needed
 */
export function createValkeyClient(
  config?: Partial<GlideClientConfiguration>,
): ValkeyClient {
  return new ValkeyClient(config);
}
