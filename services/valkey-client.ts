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
   * Explicit resource management: automatically disconnect when using `using` directive
   */
  [Symbol.dispose](): void {
    this.disconnect();
  }

  /**
   * Deletes a key from the database.
   *
   * @param key - The key to look up
   * @returns true if the deletion was successful, and false if nothing was deleted.
   */
  async delete(key: string): Promise<boolean> {
    if (!this.client) {
      throw new Error("Client not connected. Call connect() first.");
    }
    return (await this.client.del([key])) === 1;
  }

  /**
   * Get a string value from the database, ensuring `GlideString` responses are converted to UTF-8
   * strings.
   *
   * @param key - The key to look up
   * @returns the string value at the given key, or null if the key does not exist in the database.
   */
  async getString(key: string): Promise<string | null> {
    if (!this.client) {
      throw new Error("Client not connected. Call connect() first.");
    }
    const gs = await this.client.get(key);
    return gs?.toString() ?? null;
  }

  /**
   * Sets a string value to the database with a time-to-live (TTL).
   *
   * @param key - The key to set
   * @param value - The value to set for the given key
   * @param ttl - The TTL of the key/value pair in seconds
   * @returns true if both the key/value pair was set and the TTL was set, false otherwise.
   */
  async setWithTTL(
    key: string,
    value: string,
    ttl: number,
  ): Promise<boolean> {
    if (!this.client) {
      throw new Error("Client not connected. Call connect() first.");
    }

    const res = await this.client.set(key, value);
    if (res !== "OK") {
      return false;
    }

    return await this.client.expire(key, ttl);
  }

  /**
   * Checks whether an entry exists in the Valkey database for the given string.
   *
   * @param key - The key to check
   * @returns true if at least one entry with that key exists in the database.
   */
  async hasKey(key: string): Promise<boolean> {
    if (!this.client) {
      throw new Error("Client not connected. Call connect() first.");
    }
    return await this.client.exists([key]) > 0;
  }

  /**
   * Gives the remaining time-to-live (TTL) on a given key.
   *
   * @param key - The key to check
   * @returns The key's remaining TTL in seconds, or null if the key either does not exist or has
   * no expiry.
   */
  async ttl(key: string): Promise<number | null> {
    if (!this.client) {
      throw new Error("Client not connected. Call connect() first.");
    }

    const ttl = await this.client.ttl(key);
    if (ttl < 0) {
      return null;
    }

    return ttl;
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
