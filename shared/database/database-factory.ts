/**
 * Database Service Factory
 *
 * Creates DatabaseService instances based on configuration.
 */

import type { DatabaseService } from "./database-service.ts";
import {
  createIovalkeyDatabaseService,
  type IovalkeyDatabaseConfig,
} from "./iovalkey-database-service.ts";

export interface DatabaseServiceConfig {
  backend: "valkey";
  valkey?: IovalkeyDatabaseConfig;
}

/**
 * Creates a DatabaseService instance based on the provided configuration.
 *
 * @param config - Database configuration specifying backend and connection details
 * @returns A DatabaseService instance
 *
 * @example
 * ```ts
 * // Create valkey backend
 * const db = createDatabaseService({
 *   backend: "valkey",
 *   valkey: { host: "localhost", port: 6379 }
 * });
 * ```
 */
export function createDatabaseService(
  config: DatabaseServiceConfig,
): DatabaseService {
  switch (config.backend) {
    case "valkey":
      return createIovalkeyDatabaseService(config.valkey);
    default:
      throw new Error(`Unknown database backend: ${config.backend}`);
  }
}
