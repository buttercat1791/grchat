/**
 * Database Service Factory
 *
 * Creates DatabaseService instances based on configuration.
 */

import type { DatabaseService } from "./database-service.ts";
import {
  createValkeyDatabaseService,
  type ValkeyDatabaseConfig,
} from "./valkey-database-service.ts";
import {
  createDenoKvDatabaseService,
  type DenoKvDatabaseConfig,
} from "./deno-kv-database-service.ts";

export interface DatabaseServiceConfig {
  backend: "valkey" | "deno-kv";
  valkey?: ValkeyDatabaseConfig;
  denoKv?: DenoKvDatabaseConfig;
}

/**
 * Creates a DatabaseService instance based on the provided configuration.
 *
 * @param config - Database configuration specifying backend and connection details
 * @returns A DatabaseService instance
 *
 * @example
 * ```ts
 * // Create Valkey backend
 * const db = createDatabaseService({
 *   backend: "valkey",
 *   valkey: { host: "localhost", port: 6379 }
 * });
 *
 * // Create Deno KV backend
 * const db = createDatabaseService({
 *   backend: "deno-kv",
 *   denoKv: { path: "./data/kv.db" }
 * });
 * ```
 */
export function createDatabaseService(
  config: DatabaseServiceConfig,
): DatabaseService {
  switch (config.backend) {
    case "valkey":
      return createValkeyDatabaseService(config.valkey);
    case "deno-kv":
      return createDenoKvDatabaseService(config.denoKv);
    default:
      throw new Error(`Unknown database backend: ${config.backend}`);
  }
}
