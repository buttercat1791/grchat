/**
 * Valkey Database Service
 *
 * DatabaseService implementation using iovalkey (Node.js Valkey client).
 */

// AI-NOTE: Use dynamic import to avoid bundling issues with iovalkey's
// complex CommonJS module structure. This defers loading until runtime.
import type {
  DatabaseService,
  HashFields,
  ScoredMember,
  SortedSetRangeOptions,
} from "./database-service.ts";
import { DatabaseError } from "./database-error.ts";

// Type-only import to avoid bundling
type Valkey = import("iovalkey").Redis;

export interface IovalkeyDatabaseConfig {
  host?: string; // Default: "127.0.0.1" (use "valkey" in Docker)
  port?: number; // Default: 6379
  password?: string;
  db?: number; // Default: 0
  username?: string;
}

/**
 * Database service implementation using iovalkey Valkey client.
 */
export class IovalkeyDatabaseService implements DatabaseService {
  #client: Valkey | null = null;
  #config: IovalkeyDatabaseConfig;
  #valkeyClass: typeof import("iovalkey").Redis | null = null;

  constructor(config: IovalkeyDatabaseConfig = {}) {
    this.#config = config;
  }

  async connect(): Promise<void> {
    try {
      // Dynamically import iovalkey at runtime
      if (!this.#valkeyClass) {
        const iovalkey = await import("iovalkey");
        this.#valkeyClass = iovalkey.Redis;
      }

      this.#client = new this.#valkeyClass({
        host: this.#config.host ?? "127.0.0.1",
        port: this.#config.port ?? 6379,
        password: this.#config.password,
        db: this.#config.db ?? 0,
        username: this.#config.username,
      });

      // Test connection
      await this.#client.ping();
    } catch (error) {
      this.#client = null;
      throw DatabaseError.operationFailed(
        "connect",
        "Failed to connect to Valkey",
        error,
      );
    }
  }

  disconnect(): void {
    // Disconnect all subscribers first
    for (const [_channel, subscriber] of this.#subscribers) {
      subscriber.disconnect();
    }
    this.#subscribers.clear();

    // Disconnect main client
    if (this.#client) {
      this.#client.disconnect();
      this.#client = null;
    }
  }

  isConnected(): boolean {
    return this.#client?.status === "ready";
  }

  [Symbol.dispose](): void {
    this.disconnect();
  }

  // String Operations

  async getString(key: string): Promise<string | null> {
    this.#ensureConnected("getString");
    try {
      return await this.#client!.get(key);
    } catch (error) {
      throw DatabaseError.operationFailed("getString", key, error);
    }
  }

  async setStringWithTTL(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    this.#ensureConnected("setStringWithTTL");
    try {
      const result = await this.#client!.set(key, value, "EX", ttlSeconds);
      return result === "OK";
    } catch (error) {
      throw DatabaseError.operationFailed("setStringWithTTL", key, error);
    }
  }

  // Hash Operations

  async getHash(key: string): Promise<HashFields | null> {
    this.#ensureConnected("getHash");
    try {
      const result = await this.#client!.hgetall(key);
      // Return null for empty hash (non-existent key)
      return Object.keys(result).length === 0 ? null : result;
    } catch (error) {
      throw DatabaseError.operationFailed("getHash", key, error);
    }
  }

  async setHash(key: string, fields: HashFields): Promise<boolean> {
    this.#ensureConnected("setHash");
    try {
      await this.#client!.hset(key, fields);
      return true;
    } catch (error) {
      throw DatabaseError.operationFailed("setHash", key, error);
    }
  }

  async setHashWithTTL(
    key: string,
    fields: HashFields,
    ttlSeconds: number,
  ): Promise<boolean> {
    this.#ensureConnected("setHashWithTTL");
    try {
      await this.#client!.hset(key, fields);
      await this.#client!.expire(key, ttlSeconds);
      return true;
    } catch (error) {
      throw DatabaseError.operationFailed("setHashWithTTL", key, error);
    }
  }

  async getHashField(key: string, field: string): Promise<string | null> {
    this.#ensureConnected("getHashField");
    try {
      return await this.#client!.hget(key, field);
    } catch (error) {
      throw DatabaseError.operationFailed(
        "getHashField",
        `${key}:${field}`,
        error,
      );
    }
  }

  async setHashField(
    key: string,
    field: string,
    value: string,
  ): Promise<boolean> {
    this.#ensureConnected("setHashField");
    try {
      await this.#client!.hset(key, field, value);
      return true;
    } catch (error) {
      throw DatabaseError.operationFailed(
        "setHashField",
        `${key}:${field}`,
        error,
      );
    }
  }

  // Set Operations

  async setAdd(key: string, ...members: string[]): Promise<number> {
    this.#ensureConnected("setAdd");
    try {
      return await this.#client!.sadd(key, ...members);
    } catch (error) {
      throw DatabaseError.operationFailed("setAdd", key, error);
    }
  }

  async setRemove(key: string, ...members: string[]): Promise<number> {
    this.#ensureConnected("setRemove");
    try {
      return await this.#client!.srem(key, ...members);
    } catch (error) {
      throw DatabaseError.operationFailed("setRemove", key, error);
    }
  }

  async setIsMember(key: string, member: string): Promise<boolean> {
    this.#ensureConnected("setIsMember");
    try {
      const result = await this.#client!.sismember(key, member);
      return result === 1;
    } catch (error) {
      throw DatabaseError.operationFailed("setIsMember", key, error);
    }
  }

  async setMembers(key: string): Promise<string[]> {
    this.#ensureConnected("setMembers");
    try {
      return await this.#client!.smembers(key);
    } catch (error) {
      throw DatabaseError.operationFailed("setMembers", key, error);
    }
  }

  // Sorted Set Operations

  async sortedSetAdd(key: string, members: ScoredMember[]): Promise<number> {
    this.#ensureConnected("sortedSetAdd");
    try {
      // Convert ScoredMember[] to flat array [score1, member1, score2, member2, ...]
      const args: (number | string)[] = [];
      for (const { score, member } of members) {
        args.push(score, member);
      }
      return await this.#client!.zadd(key, ...args);
    } catch (error) {
      throw DatabaseError.operationFailed("sortedSetAdd", key, error);
    }
  }

  async sortedSetRemove(key: string, ...members: string[]): Promise<number> {
    this.#ensureConnected("sortedSetRemove");
    try {
      return await this.#client!.zrem(key, ...members);
    } catch (error) {
      throw DatabaseError.operationFailed("sortedSetRemove", key, error);
    }
  }

  async sortedSetRange(
    key: string,
    start: number,
    stop: number,
    options?: SortedSetRangeOptions,
  ): Promise<string[] | ScoredMember[]> {
    this.#ensureConnected("sortedSetRange");
    try {
      let result: string[];

      if (options?.reverse) {
        result = options?.withScores
          ? await this.#client!.zrevrange(
            key,
            start,
            stop.toString(),
            "WITHSCORES",
          )
          : await this.#client!.zrevrange(key, start, stop.toString());
      } else {
        result = options?.withScores
          ? await this.#client!.zrange(
            key,
            start,
            stop.toString(),
            "WITHSCORES",
          )
          : await this.#client!.zrange(key, start, stop.toString());
      }

      if (options?.withScores) {
        // Transform flat array [member1, score1, member2, score2, ...] to ScoredMember[]
        const scored: ScoredMember[] = [];
        for (let i = 0; i < result.length; i += 2) {
          scored.push({
            member: result[i] as string,
            score: parseFloat(result[i + 1] as string),
          });
        }
        return scored;
      }

      return result as string[];
    } catch (error) {
      throw DatabaseError.operationFailed("sortedSetRange", key, error);
    }
  }

  async sortedSetRangeByScore(
    key: string,
    min: number,
    max: number,
    options?: SortedSetRangeOptions,
  ): Promise<string[]> {
    this.#ensureConnected("sortedSetRangeByScore");
    try {
      let result: string[];

      if (options?.limit) {
        result = await this.#client!.zrangebyscore(
          key,
          min,
          max,
          "LIMIT",
          options.limit.offset,
          options.limit.count,
        );
      } else {
        result = await this.#client!.zrangebyscore(key, min, max);
      }

      return result as string[];
    } catch (error) {
      throw DatabaseError.operationFailed("sortedSetRangeByScore", key, error);
    }
  }

  async sortedSetScore(key: string, member: string): Promise<number | null> {
    this.#ensureConnected("sortedSetScore");
    try {
      const result = await this.#client!.zscore(key, member);
      return result === null ? null : parseFloat(result);
    } catch (error) {
      throw DatabaseError.operationFailed("sortedSetScore", key, error);
    }
  }

  async sortedSetCard(key: string): Promise<number> {
    this.#ensureConnected("sortedSetCard");
    try {
      return await this.#client!.zcard(key);
    } catch (error) {
      throw DatabaseError.operationFailed("sortedSetCard", key, error);
    }
  }

  // Pub/Sub Operations

  #subscribers: Map<string, Valkey> = new Map();

  async publish(channel: string, message: string): Promise<void> {
    this.#ensureConnected("publish");
    try {
      await this.#client!.publish(channel, message);
    } catch (error) {
      throw DatabaseError.operationFailed("publish", channel, error);
    }
  }

  async subscribe(
    channel: string,
    callback: (message: string) => void | Promise<void>,
  ): Promise<void> {
    this.#ensureConnected("subscribe");
    try {
      // Create a duplicate client for pub/sub (required by iovalkey)
      if (!this.#valkeyClass) {
        throw new Error("Valkey class not initialized");
      }

      const subscriber = new this.#valkeyClass({
        host: this.#config.host ?? "127.0.0.1",
        port: this.#config.port ?? 6379,
        password: this.#config.password,
        db: this.#config.db ?? 0,
        username: this.#config.username,
      });

      // Set up message handler
      subscriber.on("message", (_ch: string, msg: string) => {
        callback(msg);
      });

      // Subscribe to channel
      await subscriber.subscribe(channel);

      // Store subscriber for later cleanup
      this.#subscribers.set(channel, subscriber);
    } catch (error) {
      throw DatabaseError.operationFailed("subscribe", channel, error);
    }
  }

  async unsubscribe(channel: string): Promise<void> {
    try {
      const subscriber = this.#subscribers.get(channel);
      if (subscriber) {
        await subscriber.unsubscribe(channel);
        subscriber.disconnect();
        this.#subscribers.delete(channel);
      }
    } catch (error) {
      throw DatabaseError.operationFailed("unsubscribe", channel, error);
    }
  }

  // Key Operations

  async delete(key: string): Promise<boolean> {
    this.#ensureConnected("delete");
    try {
      const result = await this.#client!.del(key);
      return result > 0;
    } catch (error) {
      throw DatabaseError.operationFailed("delete", key, error);
    }
  }

  async exists(key: string): Promise<boolean> {
    this.#ensureConnected("exists");
    try {
      const result = await this.#client!.exists(key);
      return result === 1;
    } catch (error) {
      throw DatabaseError.operationFailed("exists", key, error);
    }
  }

  async ttl(key: string): Promise<number | null> {
    this.#ensureConnected("ttl");
    try {
      const result = await this.#client!.ttl(key);
      // -2 = key doesn't exist, -1 = no TTL set
      if (result === -2 || result === -1) {
        return null;
      }
      return result;
    } catch (error) {
      throw DatabaseError.operationFailed("ttl", key, error);
    }
  }

  async setTTL(key: string, ttlSeconds: number): Promise<boolean> {
    this.#ensureConnected("setTTL");
    try {
      const result = await this.#client!.expire(key, ttlSeconds);
      return result === 1;
    } catch (error) {
      throw DatabaseError.operationFailed("setTTL", key, error);
    }
  }

  // Private helpers

  #ensureConnected(operation: string): void {
    if (!this.#client || this.#client.status !== "ready") {
      throw DatabaseError.notConnected(operation);
    }
  }
}

/**
 * Factory function to create an IovalkeyDatabaseService instance.
 */
export function createIovalkeyDatabaseService(
  config?: IovalkeyDatabaseConfig,
): IovalkeyDatabaseService {
  return new IovalkeyDatabaseService(config);
}
