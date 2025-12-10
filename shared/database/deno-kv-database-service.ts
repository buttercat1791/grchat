/// <reference lib="deno.unstable" />

/**
 * Deno KV Database Service Implementation
 *
 * Deno KV does not natively support Redis-style data structures. To maintain compatibility with
 * the shared interface, this service reimplements some Redis-style data structures on Deno KV's
 * primitives.
 */

import type {
  DatabaseService,
  HashFields,
  ScoredMember,
  SortedSetRangeOptions,
} from "./database-service.ts";
import { DatabaseError } from "./database-error.ts";

export interface DenoKvDatabaseConfig {
  path?: string;
}

/**
 * Pads a number to 20 digits for lexicographic sorting in Deno KV keys.
 */
function padScore(score: number): string {
  // Handle negative numbers by offsetting to positive range
  // Max safe integer is ~9e15, so we add 1e16 to ensure positivity
  const offset = 1e16;
  const paddedValue = Math.floor(score * 1e6) + offset;
  return paddedValue.toString().padStart(20, "0");
}

/**
 * Unpads a score string back to a number.
 */
function unpadScore(paddedScore: string): number {
  const offset = 1e16;
  const value = parseInt(paddedScore, 10) - offset;
  return value / 1e6;
}

/**
 * Converts a string key to a Deno KV key array.
 */
function parseKey(key: string): Deno.KvKey {
  return key.split(".");
}

export class DenoKvDatabaseService implements DatabaseService {
  #kv: Deno.Kv | null = null;
  #path?: string;

  constructor(config?: DenoKvDatabaseConfig) {
    this.#path = config?.path;
  }

  // Lifecycle methods

  async connect(): Promise<void> {
    if (this.#kv) {
      throw new Error("KV already connected");
    }
    this.#kv = await Deno.openKv(this.#path);
  }

  disconnect(): void {
    if (this.#kv) {
      this.#kv.close();
      this.#kv = null;
    }
  }

  isConnected(): boolean {
    return this.#kv !== null;
  }

  [Symbol.dispose](): void {
    this.disconnect();
  }

  // String operations

  async getString(key: string): Promise<string | null> {
    this.#ensureConnected("getString");
    const kvKey = parseKey(key);
    const result = await this.#kv!.get<string>(kvKey);
    return result.value;
  }

  async setStringWithTTL(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    this.#ensureConnected("setStringWithTTL");
    const kvKey = parseKey(key);
    const expiryAt = Date.now() + ttlSeconds * 1000;

    const res = await this.#kv!.set(kvKey, value, {
      expireIn: ttlSeconds * 1000,
    });

    if (!res.ok) {
      return false;
    }

    // Store expiry metadata
    await this.#kv!.set([...kvKey, "__expiry__"], expiryAt, {
      expireIn: ttlSeconds * 1000,
    });

    return true;
  }

  // Hash operations

  async getHash(key: string): Promise<HashFields | null> {
    this.#ensureConnected("getHash");
    const kvKey = parseKey(key);
    const result = await this.#kv!.get<HashFields>(kvKey);
    return result.value;
  }

  async setHash(key: string, fields: HashFields): Promise<boolean> {
    this.#ensureConnected("setHash");
    const kvKey = parseKey(key);
    const res = await this.#kv!.set(kvKey, fields);
    return res.ok;
  }

  async setHashWithTTL(
    key: string,
    fields: HashFields,
    ttlSeconds: number,
  ): Promise<boolean> {
    this.#ensureConnected("setHashWithTTL");
    const kvKey = parseKey(key);
    const expiryAt = Date.now() + ttlSeconds * 1000;

    const res = await this.#kv!.set(kvKey, fields, {
      expireIn: ttlSeconds * 1000,
    });

    if (!res.ok) {
      return false;
    }

    // Store expiry metadata
    await this.#kv!.set([...kvKey, "__expiry__"], expiryAt, {
      expireIn: ttlSeconds * 1000,
    });

    return true;
  }

  async getHashField(key: string, field: string): Promise<string | null> {
    this.#ensureConnected("getHashField");
    const hash = await this.getHash(key);
    return hash?.[field] ?? null;
  }

  async setHashField(
    key: string,
    field: string,
    value: string,
  ): Promise<boolean> {
    this.#ensureConnected("setHashField");
    const kvKey = parseKey(key);

    // Read existing hash
    const existing = await this.#kv!.get<HashFields>(kvKey);
    const fields = existing.value ?? {};
    fields[field] = value;

    const res = await this.#kv!.set(kvKey, fields);
    return res.ok;
  }

  // Set operations
  // Sets are stored as individual keys: [...baseKey, member]

  async setAdd(key: string, ...members: string[]): Promise<number> {
    this.#ensureConnected("setAdd");
    const kvKey = parseKey(key);
    let addedCount = 0;

    for (const member of members) {
      const memberKey = [...kvKey, member];
      const existing = await this.#kv!.get(memberKey);

      if (!existing.value) {
        await this.#kv!.set(memberKey, true);
        addedCount++;
      }
    }

    return addedCount;
  }

  async setRemove(key: string, ...members: string[]): Promise<number> {
    this.#ensureConnected("setRemove");
    const kvKey = parseKey(key);
    let removedCount = 0;

    for (const member of members) {
      const memberKey = [...kvKey, member];
      const existing = await this.#kv!.get(memberKey);

      if (existing.value) {
        await this.#kv!.delete(memberKey);
        removedCount++;
      }
    }

    return removedCount;
  }

  async setIsMember(key: string, member: string): Promise<boolean> {
    this.#ensureConnected("setIsMember");
    const kvKey = parseKey(key);
    const memberKey = [...kvKey, member];
    const result = await this.#kv!.get(memberKey);
    return result.value !== null;
  }

  async setMembers(key: string): Promise<string[]> {
    this.#ensureConnected("setMembers");
    const kvKey = parseKey(key);
    const members: string[] = [];

    const iter = this.#kv!.list({ prefix: kvKey });
    for await (const entry of iter) {
      // Extract the member from the key (last element)
      const member = entry.key[entry.key.length - 1];
      if (typeof member === "string") {
        members.push(member);
      }
    }

    return members;
  }

  // Sorted set operations
  // Stored as: [...baseKey, paddedScore, member] with reverse lookup [...baseKey, "__lookup__", member] -> score

  async sortedSetAdd(key: string, members: ScoredMember[]): Promise<number> {
    this.#ensureConnected("sortedSetAdd");
    const kvKey = parseKey(key);
    let addedCount = 0;

    for (const { member, score } of members) {
      const lookupKey = [...kvKey, "__lookup__", member];
      const existing = await this.#kv!.get<number>(lookupKey);

      // Remove old entry if exists with different score
      if (existing.value !== null && existing.value !== score) {
        const oldPaddedScore = padScore(existing.value);
        await this.#kv!.delete([...kvKey, oldPaddedScore, member]);
      }

      // Add new entry
      const paddedScore = padScore(score);
      const scoreKey = [...kvKey, paddedScore, member];
      await this.#kv!.set(scoreKey, true);
      await this.#kv!.set(lookupKey, score);

      if (!existing.value) {
        addedCount++;
      }
    }

    return addedCount;
  }

  async sortedSetRemove(key: string, ...members: string[]): Promise<number> {
    this.#ensureConnected("sortedSetRemove");
    const kvKey = parseKey(key);
    let removedCount = 0;

    for (const member of members) {
      const lookupKey = [...kvKey, "__lookup__", member];
      const existing = await this.#kv!.get<number>(lookupKey);

      if (existing.value !== null) {
        const paddedScore = padScore(existing.value);
        await this.#kv!.delete([...kvKey, paddedScore, member]);
        await this.#kv!.delete(lookupKey);
        removedCount++;
      }
    }

    return removedCount;
  }

  async sortedSetRange(
    key: string,
    start: number,
    stop: number,
    options?: SortedSetRangeOptions,
  ): Promise<string[] | ScoredMember[]> {
    this.#ensureConnected("sortedSetRange");
    const kvKey = parseKey(key);
    const results: ScoredMember[] = [];

    // AI-NOTE: This operation may load large amounts of DB values into memory for large sorted
    // sets. If performance or memory limits cause problems, refactor `sortedSetRange` to only
    // load the required values from the DB, rather than loading all values and returning a slice.

    // List all entries, excluding lookup entries
    const iter = this.#kv!.list({ prefix: kvKey });
    for await (const entry of iter) {
      const keyParts = entry.key.slice(kvKey.length);

      // Skip lookup entries
      if (keyParts[0] === "__lookup__") {
        continue;
      }

      const paddedScore = keyParts[0] as string;
      const member = keyParts[1] as string;
      const score = unpadScore(paddedScore);

      results.push({ member, score });
    }

    // Apply reverse if needed
    if (options?.reverse) {
      results.reverse();
    }

    // Handle negative indices
    const length = results.length;
    const actualStart = start < 0 ? Math.max(0, length + start) : start;
    const actualStop = stop < 0 ? length + stop : stop;

    // Slice the results
    const sliced = results.slice(actualStart, actualStop + 1);

    // Return with or without scores
    if (options?.withScores) {
      return sliced;
    } else {
      return sliced.map((sm) => sm.member);
    }
  }

  async sortedSetRangeByScore(
    key: string,
    min: number,
    max: number,
    options?: SortedSetRangeOptions,
  ): Promise<string[]> {
    this.#ensureConnected("sortedSetRangeByScore");
    const kvKey = parseKey(key);
    const minPadded = padScore(min);
    const maxPadded = padScore(max);
    const members: string[] = [];

    // List entries within the score range
    const iter = this.#kv!.list({
      prefix: kvKey,
      start: [...kvKey, minPadded],
      end: [...kvKey, maxPadded, "\xff"], // \xff ensures we include the max boundary
    });

    for await (const entry of iter) {
      const keyParts = entry.key.slice(kvKey.length);

      // Skip lookup entries
      if (keyParts[0] === "__lookup__") {
        continue;
      }

      const member = keyParts[1] as string;
      members.push(member);
    }

    if (options?.reverse) {
      members.reverse();
    }

    return members;
  }

  async sortedSetScore(key: string, member: string): Promise<number | null> {
    this.#ensureConnected("sortedSetScore");
    const kvKey = parseKey(key);
    const lookupKey = [...kvKey, "__lookup__", member];
    const result = await this.#kv!.get<number>(lookupKey);
    return result.value;
  }

  // Key operations

  async delete(key: string): Promise<boolean> {
    this.#ensureConnected("delete");
    const kvKey = parseKey(key);
    await this.#kv!.delete(kvKey);
    // Also delete expiry metadata if exists
    await this.#kv!.delete([...kvKey, "__expiry__"]);
    return true;
  }

  async exists(key: string): Promise<boolean> {
    this.#ensureConnected("exists");
    const kvKey = parseKey(key);
    const result = await this.#kv!.get(kvKey);
    return result.value !== null;
  }

  async ttl(key: string): Promise<number | null> {
    this.#ensureConnected("ttl");
    const kvKey = parseKey(key);
    const expiryResult = await this.#kv!.get<number>([...kvKey, "__expiry__"]);

    if (!expiryResult.value) {
      return null;
    }

    const remainingMs = expiryResult.value - Date.now();
    return remainingMs > 0 ? Math.floor(remainingMs / 1000) : null;
  }

  async setTTL(key: string, ttlSeconds: number): Promise<boolean> {
    this.#ensureConnected("setTTL");
    const kvKey = parseKey(key);

    // Get the current value
    const current = await this.#kv!.get(kvKey);
    if (current.value === null) {
      return false;
    }

    // Re-set with new TTL
    const expiryAt = Date.now() + ttlSeconds * 1000;
    await this.#kv!.set(kvKey, current.value, {
      expireIn: ttlSeconds * 1000,
    });

    // Update expiry metadata
    await this.#kv!.set([...kvKey, "__expiry__"], expiryAt, {
      expireIn: ttlSeconds * 1000,
    });

    return true;
  }

  // Private helpers

  #ensureConnected(operation: string): void {
    if (!this.#kv) {
      throw DatabaseError.notConnected(operation);
    }
  }
}

/**
 * Factory function to create a Deno KV database service instance.
 */
export function createDenoKvDatabaseService(
  config?: DenoKvDatabaseConfig,
): DenoKvDatabaseService {
  return new DenoKvDatabaseService(config);
}
