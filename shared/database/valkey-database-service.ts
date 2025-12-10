/**
 * Valkey Database Service Implementation
 *
 * Implements DatabaseService interface using Valkey GLIDE client.
 */

import { GlideClient, GlideClientConfiguration } from "@valkey/valkey-glide";
import type {
  DatabaseService,
  HashFields,
  ScoredMember,
  SortedSetRangeOptions,
} from "./database-service.ts";
import { DatabaseError } from "./database-error.ts";

export interface ValkeyDatabaseConfig {
  host?: string;
  port?: number;
}

export class ValkeyDatabaseService implements DatabaseService {
  #client: GlideClient | null = null;
  #config: GlideClientConfiguration;

  constructor(config?: ValkeyDatabaseConfig) {
    this.#config = {
      addresses: [
        {
          host: config?.host ?? "localhost",
          port: config?.port ?? 6379,
        },
      ],
    };
  }

  // Lifecycle methods

  async connect(): Promise<void> {
    if (this.#client) {
      throw new Error("Client already connected");
    }
    this.#client = await GlideClient.createClient(this.#config);
  }

  disconnect(): void {
    if (this.#client) {
      this.#client.close();
      this.#client = null;
    }
  }

  isConnected(): boolean {
    return this.#client !== null;
  }

  [Symbol.dispose](): void {
    this.disconnect();
  }

  // String operations

  async getString(key: string): Promise<string | null> {
    this.#ensureConnected("getString");
    const gs = await this.#client!.get(key);
    return gs?.toString() ?? null;
  }

  async setStringWithTTL(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    this.#ensureConnected("setStringWithTTL");

    const res = await this.#client!.set(key, value);
    if (res !== "OK") {
      return false;
    }

    return await this.#client!.expire(key, ttlSeconds);
  }

  // Hash operations

  async getHash(key: string): Promise<HashFields | null> {
    this.#ensureConnected("getHash");
    const result = await this.#client!.hgetall(key);
    if (!result || Object.keys(result).length === 0) {
      return null;
    }

    // Convert GlideString values to regular strings
    const fields: HashFields = {};
    for (const [field, value] of Object.entries(result)) {
      fields[field] = value.toString();
    }
    return fields;
  }

  async setHash(key: string, fields: HashFields): Promise<boolean> {
    this.#ensureConnected("setHash");
    await this.#client!.hset(key, fields);
    return true;
  }

  async setHashWithTTL(
    key: string,
    fields: HashFields,
    ttlSeconds: number,
  ): Promise<boolean> {
    this.#ensureConnected("setHashWithTTL");
    await this.#client!.hset(key, fields);
    return await this.#client!.expire(key, ttlSeconds);
  }

  async getHashField(key: string, field: string): Promise<string | null> {
    this.#ensureConnected("getHashField");
    const result = await this.#client!.hget(key, field);
    return result?.toString() ?? null;
  }

  async setHashField(
    key: string,
    field: string,
    value: string,
  ): Promise<boolean> {
    this.#ensureConnected("setHashField");
    await this.#client!.hset(key, { [field]: value });
    return true;
  }

  // Set operations

  async setAdd(key: string, ...members: string[]): Promise<number> {
    this.#ensureConnected("setAdd");
    return await this.#client!.sadd(key, members);
  }

  async setRemove(key: string, ...members: string[]): Promise<number> {
    this.#ensureConnected("setRemove");
    return await this.#client!.srem(key, members);
  }

  async setIsMember(key: string, member: string): Promise<boolean> {
    this.#ensureConnected("setIsMember");
    return await this.#client!.sismember(key, member);
  }

  async setMembers(key: string): Promise<string[]> {
    this.#ensureConnected("setMembers");
    const members = await this.#client!.smembers(key);
    return Array.from(members).map((m) => m.toString());
  }

  // Sorted set operations

  async sortedSetAdd(key: string, members: ScoredMember[]): Promise<number> {
    this.#ensureConnected("sortedSetAdd");
    // Convert to the format expected by zadd: Record<string, number>
    const scoreMap: Record<string, number> = {};
    for (const { member, score } of members) {
      scoreMap[member] = score;
    }
    return await this.#client!.zadd(key, scoreMap);
  }

  async sortedSetRemove(key: string, ...members: string[]): Promise<number> {
    this.#ensureConnected("sortedSetRemove");
    return await this.#client!.zrem(key, members);
  }

  async sortedSetRange(
    key: string,
    start: number,
    stop: number,
    options?: SortedSetRangeOptions,
  ): Promise<string[] | ScoredMember[]> {
    this.#ensureConnected("sortedSetRange");

    if (options?.withScores) {
      const result = await this.#client!.zrangeWithScores(key, {
        start,
        end: stop,
      });

      const scoredMembers: ScoredMember[] = result.map((item) => ({
        member: item.element.toString(),
        score: item.score,
      }));

      if (options?.reverse) {
        scoredMembers.reverse();
      }

      return scoredMembers;
    } else {
      const result = await this.#client!.zrange(key, { start, end: stop });

      const members = result.map((m) => m.toString());

      if (options?.reverse) {
        members.reverse();
      }

      return members;
    }
  }

  async sortedSetRangeByScore(
    key: string,
    min: number,
    max: number,
    options?: SortedSetRangeOptions,
  ): Promise<string[]> {
    this.#ensureConnected("sortedSetRangeByScore");

    const result = await this.#client!.zrange(key, {
      start: min,
      end: max,
      type: "byScore",
    });

    const members = result.map((m) => m.toString());

    if (options?.reverse) {
      members.reverse();
    }

    return members;
  }

  async sortedSetScore(key: string, member: string): Promise<number | null> {
    this.#ensureConnected("sortedSetScore");
    return await this.#client!.zscore(key, member);
  }

  // Key operations

  async delete(key: string): Promise<boolean> {
    this.#ensureConnected("delete");
    return (await this.#client!.del([key])) === 1;
  }

  async exists(key: string): Promise<boolean> {
    this.#ensureConnected("exists");
    return (await this.#client!.exists([key])) > 0;
  }

  async ttl(key: string): Promise<number | null> {
    this.#ensureConnected("ttl");
    const ttl = await this.#client!.ttl(key);
    return ttl < 0 ? null : ttl;
  }

  async setTTL(key: string, ttlSeconds: number): Promise<boolean> {
    this.#ensureConnected("setTTL");
    return await this.#client!.expire(key, ttlSeconds);
  }

  // Private helpers

  #ensureConnected(operation: string): void {
    if (!this.#client) {
      throw DatabaseError.notConnected(operation);
    }
  }
}

/**
 * Factory function to create a Valkey database service instance.
 */
export function createValkeyDatabaseService(
  config?: ValkeyDatabaseConfig,
): ValkeyDatabaseService {
  return new ValkeyDatabaseService(config);
}
