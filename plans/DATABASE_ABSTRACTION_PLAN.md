# Database Abstraction Layer Implementation Plan

## Summary

Implement a dual-database architecture supporting both Valkey and Deno KV
backends for grchat. This enables:

- **Deno KV** for local development, standalone builds, and Deno Deploy
- **Valkey** for containerized and self-hosted production deployments

## File Structure

```
shared/database/
  mod.ts                        # Module public re-exports
  database-service.ts           # Interface definition
  database-schemas.ts           # Zod schemas for method parameters
  database-error.ts             # DatabaseError class
  valkey-database-service.ts    # Valkey implementation
  deno-kv-database-service.ts   # Deno KV implementation
  database-factory.ts           # Factory function
```

## Implementation Phases

### Phase 1: Define Interface and Create Directory Structure

**Files to create:**

1. **`shared/database/database-service.ts`** - Core interface

   ```typescript
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
       key,
       start,
       stop,
       options?,
     ): Promise<string[] | ScoredMember[]>;
     sortedSetRangeByScore(key, min, max, options?): Promise<string[]>;
     sortedSetScore(key: string, member: string): Promise<number | null>;

     // Key Operations
     delete(key: string): Promise<boolean>;
     exists(key: string): Promise<boolean>;
     ttl(key: string): Promise<number | null>;
     setTTL(key: string, ttlSeconds: number): Promise<boolean>;
   }
   ```

2. **`shared/database/database-schemas.ts`** - Zod validation schemas
3. **`shared/database/database-error.ts`** - Custom error class
4. **`shared/database/mod.ts`** - Re-exports

### Phase 2: Implement Valkey Backend

**File:** `shared/database/valkey-database-service.ts`

- Extract implementation from existing `shared/valkey-client.ts`
- Implement full `DatabaseService` interface
- Add missing operations: hash, set, sorted set methods
- Factory function: `createValkeyDatabaseService()`

### Phase 3: Implement Deno KV Backend

**File:** `shared/database/deno-kv-database-service.ts`

**Key pattern mappings:**

| Data Structure | Valkey Key                | Deno KV Key Pattern                                           |
| -------------- | ------------------------- | ------------------------------------------------------------- |
| Hash           | `chat.message.<id>`       | `["chat", "message", "<id>"]` (store object)                  |
| String         | `session.<pubkey>`        | `["session", "<pubkey>"]`                                     |
| Set            | `admin.allowlist`         | `["admin", "allowlist", "<member>"]` (per-member keys)        |
| Sorted Set     | `index.messages.timeline` | `["index", "messages", "timeline", "<padded-score>", "<id>"]` |

**Sorted set strategy:**

- Use lexicographically-ordered composite keys:
  `[...baseKey, paddedScore, member]`
- Maintain reverse lookup keys for score retrieval:
  `[...baseKey, "__lookup__", member]`
- Pad scores to 20 digits for proper ordering

Factory function: `createDenoKvDatabaseService(path?)`

### Phase 4: Create Database Factory

**File:** `shared/database/database-factory.ts`

```typescript
export function createDatabaseService(
  config?: DatabaseServiceConfig
): DatabaseService {
  const cfg = config ?? getDatabaseConfig();
  switch (cfg.backend) {
    case "valkey":
      return createValkeyDatabaseService({...});
    case "deno-kv":
      return createDenoKvDatabaseService(cfg.denoKv?.path);
  }
}
```

### Phase 5: Update Configuration Schema

**File:** `features/config/config-schema.ts`

Add backend selection to database config:

```typescript
const DatabaseConfigSchema = z.object({
  backend: z.enum(["valkey", "deno-kv"]).default("valkey"),
  valkey: z
    .object({
      host: z.string().default("localhost"),
      port: z.number().default(6379),
    })
    .optional(),
  deno_kv: z
    .object({
      path: z.string().optional(),
    })
    .optional(),
});
```

**File:** `features/config/config-provider.ts`

Add environment overrides:

- `GRCHAT_DATABASE_BACKEND` - "valkey" or "deno-kv"
- `GRCHAT_DATABASE_DENO_KV_PATH` - optional path for Deno KV file

### Phase 6: Update grchat.yaml

```yaml
database:
  backend: "valkey" # Options: "valkey" | "deno-kv"
  valkey:
    host: "valkey"
    port: 6379
  deno_kv:
    path: null # null = default Deno cache location
```

### Phase 7: Update AppServices

**File:** `shared/app-services.ts`

- Replace `#valkeyClientInstance: ValkeyClient` with
  `#databaseServiceInstance: DatabaseService`
- Add `get databaseService(): DatabaseService` getter
- Update `initialize()` to use `createDatabaseService()`
- Update `shutdown()` to disconnect database service
- Deprecate `valkeyClient` getter (optional - can remove if no external usage)

### Phase 8: Migrate Consumers

**File:** `features/auth/session-manager-service.ts`

- Change constructor parameter: `ValkeyClient` → `DatabaseService`
- Update method calls:
  - `setWithTTL()` → `setStringWithTTL()`
  - `getString()` → `getString()` (unchanged)
  - `delete()` → `delete()` (unchanged)
  - `ttl()` → `ttl()` (unchanged)
  - `hasKey()` → `exists()`

### Phase 9: Cleanup

- Remove deprecated `shared/valkey-client.ts`
- Remove deprecated `valkeyClient` getter from AppServices
- Update all import paths to use `@/shared/database/mod.ts`

## Critical Files to Modify

| File                                       | Changes                                   |
| ------------------------------------------ | ----------------------------------------- |
| `shared/app-services.ts`                   | Replace ValkeyClient with DatabaseService |
| `features/config/config-schema.ts`         | Add backend selection schema              |
| `features/config/config-provider.ts`       | Add env override support                  |
| `features/auth/session-manager-service.ts` | Update to use DatabaseService interface   |
| `grchat.yaml`                              | Add backend config section                |

## Deno KV TTL Limitation

**Problem:** Deno KV does not expose TTL information for existing keys. The
`SessionManager` uses `ttl()` in two places:

1. `updateSession()` - Checks TTL before updating (throws if expired)
2. `getRemainingTTL()` - Returns remaining session time

**Solution: Store expiry metadata**

For Deno KV, store the expiry timestamp alongside the value:

```typescript
// When setting with TTL:
const expiryAt = Date.now() + ttlSeconds * 1000;
await kv.set(key, value, { expireIn: ttlSeconds * 1000 });
await kv.set([...key, "__expiry__"], expiryAt, { expireIn: ttlSeconds * 1000 });

// When retrieving TTL:
const expiryAt = await kv.get<number>([...key, "__expiry__"]);
if (!expiryAt.value) return null;
return Math.max(0, Math.floor((expiryAt.value - Date.now()) / 1000));
```

This approach:

- Maintains API compatibility with Valkey
- Adds minimal storage overhead
- Metadata expires automatically with the main key
