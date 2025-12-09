/**
 * Database Service Interface
 *
 * Abstract interface for database operations supporting multiple backends (Valkey, Deno KV).
 * Provides operations for strings, hashes, sets, and sorted sets with TTL support.
 */

export type HashFields = Record<string, string>;

export interface ScoredMember {
  member: string;
  score: number;
}

export interface SortedSetRangeOptions {
  withScores?: boolean;
  reverse?: boolean;
  limit?: {
    offset: number;
    count: number;
  };
}

export interface DatabaseService extends Disposable {
  // Lifecycle
  connect(): Promise<void>;
  disconnect(): void;
  isConnected(): boolean;

  // String Operations (Sessions)
  getString(key: string): Promise<string | null>;
  setStringWithTTL(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<boolean>;

  // Hash Operations (Chat Messages, Threaded Responses)
  getHash(key: string): Promise<HashFields | null>;
  setHash(key: string, fields: HashFields): Promise<boolean>;
  setHashWithTTL(
    key: string,
    fields: HashFields,
    ttlSeconds: number,
  ): Promise<boolean>;
  getHashField(key: string, field: string): Promise<string | null>;
  setHashField(key: string, field: string, value: string): Promise<boolean>;

  // Set Operations (Allowlist)
  setAdd(key: string, ...members: string[]): Promise<number>;
  setRemove(key: string, ...members: string[]): Promise<number>;
  setIsMember(key: string, member: string): Promise<boolean>;
  setMembers(key: string): Promise<string[]>;

  // Sorted Set Operations (Timeline/Thread Indexes)
  sortedSetAdd(key: string, members: ScoredMember[]): Promise<number>;
  sortedSetRemove(key: string, ...members: string[]): Promise<number>;
  sortedSetRange(
    key: string,
    start: number,
    stop: number,
    options?: SortedSetRangeOptions,
  ): Promise<string[] | ScoredMember[]>;
  sortedSetRangeByScore(
    key: string,
    min: number,
    max: number,
    options?: SortedSetRangeOptions,
  ): Promise<string[]>;
  sortedSetScore(key: string, member: string): Promise<number | null>;

  // Key Operations
  delete(key: string): Promise<boolean>;
  exists(key: string): Promise<boolean>;
  ttl(key: string): Promise<number | null>;
  setTTL(key: string, ttlSeconds: number): Promise<boolean>;
}
