/**
 * Database Service Module
 *
 * Public API for the database abstraction layer.
 */

// Core interface and types
export type {
  DatabaseService,
  HashFields,
  ScoredMember,
  SortedSetRangeOptions,
} from "./database-service.ts";

// Error handling
export { DatabaseError } from "./database-error.ts";

// Validation schemas
export * from "./database-schemas.ts";

// Implementations
export {
  createValkeyDatabaseService,
  ValkeyDatabaseService,
} from "./valkey-database-service.ts";
export type { ValkeyDatabaseConfig } from "./valkey-database-service.ts";

export {
  createDenoKvDatabaseService,
  DenoKvDatabaseService,
} from "./deno-kv-database-service.ts";
export type { DenoKvDatabaseConfig } from "./deno-kv-database-service.ts";

// Factory
export { createDatabaseService } from "./database-factory.ts";
export type { DatabaseServiceConfig } from "./database-factory.ts";
