# Deno KV Database Assessment

## Executive Summary

This document assesses Deno KV as a database alternative to Valkey for the
grchat project. After evaluating both options across local development,
portability, scalability, and performance dimensions, we recommend a
**dual-database architecture** that supports:

- **Deno KV** for local development/testing and serverless deployments on Deno
  Deploy
- **Valkey** for large-scale, self-hosted production deployments requiring
  advanced data structures

## Background

Grchat currently uses Valkey (a Redis fork) as its primary database, leveraging
Redis-compatible data structures including:

- Hashes for storing Nostr events
- Sorted sets for timeline and thread indexes
- Sets for user allowlists
- String values with TTL for session state

The database schema is defined in
[architecture/DATABASE_SCHEMA.md](../architecture/DATABASE_SCHEMA.md).

## Evaluation Criteria

### 1. Local Development and Testing

#### Deno KV

**Advantages:**

- **Zero configuration**: Built directly into the Deno runtime, accessible with
  a single line of code: `Deno.openKv()`
- **SQLite backend**: Local development uses SQLite, providing a lightweight,
  file-based database that requires no separate process or Docker container
- **No Docker dependency**: Developers can work without Docker Compose,
  eliminating container orchestration complexity
- **Seamless API**: Identical API between local (SQLite) and production
  (FoundationDB), ensuring development/production parity
- **Built-in persistence**: SQLite files persist automatically in the Deno cache
  directory

**Disadvantages:**

- **Limited data structure support**: No native sorted sets, hashes, or Redis
  data structures; these must be manually implemented using key patterns
- **Secondary indexes**: Require manual implementation through careful key
  design patterns

**Sources:**

- [Deno KV Internals: Building a Database for the Modern
  Web](https://deno.com/blog/building-deno-kv)
- [Deno KV Quick Start](https://docs.deno.com/deploy/kv/)

#### Valkey

**Advantages:**

- **Rich data structures**: Native support for hashes, sorted sets, sets,
  strings with TTL - all currently used in grchat
- **Well-established tooling**: Mature ecosystem with GUI tools (RedisInsight),
  CLI tools, and monitoring solutions
- **Docker Compose integration**: Well-defined container setup already
  implemented

**Disadvantages:**

- **Docker dependency**: Requires Docker and Docker Compose, adding complexity
  to local setup
- **Resource overhead**: Separate container consumes memory and CPU even during
  idle development
- **Configuration complexity**: Requires network configuration, port mapping,
  volume management
- **Startup time**: Container initialization adds delay to development workflow

### 2. Portability

#### Deno KV

**Advantages:**

- **Cross-platform**: Works identically on macOS, Linux, Windows without
  platform-specific dependencies
- **Multiple deployment targets**:
  - Deno Deploy (managed serverless)
  - Any VPS with Deno runtime installed
  - Self-hosted with open-source `denokv` binary
  - Node.js environments via official npm package
- **No separate database server**: Database bundled with application runtime
- **Remote connectivity**: Production Deno Deploy databases can be accessed from
  local Deno applications using access tokens

**Disadvantages:**

- **Deno runtime dependency**: Requires Deno ecosystem; less portable to
  non-Deno environments (though npm package mitigates this)
- **Backend inconsistency**: Different backends (SQLite vs FoundationDB) may
  have subtle behavioral differences

**Sources:**

- [KV on Deno Deploy](https://docs.deno.com/deploy/kv/manual/on_deploy/)
- [Use Deno KV in Node with the New Official npm
  Package](https://deno.com/blog/kv-npm)

#### Valkey

**Advantages:**

- **Protocol compatibility**: Redis-compatible wire protocol enables broad
  client support across many languages
- **Infrastructure agnostic**: Can run anywhere containers are supported
- **Ecosystem maturity**: Widely deployed, well-understood, extensive tooling
  and libraries
- **Decoupled architecture**: Database independent of application runtime

**Disadvantages:**

- **Separate deployment**: Requires dedicated database server/container
  management
- **Network configuration**: Requires network connectivity configuration between
  app and database
- **Persistence complexity**: Requires volume mounting, backup strategies,
  snapshot configuration

### 3. Scalability

#### Deno KV

**Advantages:**

- **Built on FoundationDB**: Production backend capable of handling millions of
  operations per second
- **Automatic replication**: On Deno Deploy, data is replicated across at least
  3 data centers in the primary region
- **Global distribution**: Cross-region replication available with mutations
  typically transferred in under 5 seconds
- **Strong consistency**: ACID transactions with serializability guarantees and
  linearizability
- **Flexible consistency levels**: Choose between strong consistency (slower,
  latest data) and eventual consistency (faster, potentially stale data)
- **Zero provisioning**: Scales automatically on Deno Deploy without capacity
  planning

**Disadvantages:**

- **Vendor lock-in risk**: Full global distribution features tied to Deno Deploy
  platform
- **Self-hosted limitations**: Self-hosted `denokv` provides local scalability
  but not global distribution
- **Limited operational control**: Less fine-grained control over replication,
  sharding, and cluster topology

**Sources:**

- [Deno KV - A Global Database for Global Apps](https://deno.com/kv)
- [Deno KV Internals: Building a Database for the Modern
  Web](https://deno.com/blog/building-deno-kv)

#### Valkey

**Advantages:**

- **Proven scalability patterns**: Well-established clustering, sentinel,
  replication strategies
- **Fine-grained control**: Full control over cluster topology, sharding
  strategy, replication configuration
- **Operational maturity**: Extensive documentation, monitoring tools, and
  operational best practices
- **Self-hosted scaling**: Can scale horizontally without platform vendor
  dependency

**Disadvantages:**

- **Manual provisioning**: Requires capacity planning, cluster setup, and
  ongoing operational management
- **Complexity**: Clustering and replication add significant operational
  complexity
- **Global distribution**: Requires custom multi-region deployment and conflict
  resolution strategies

### 4. Performance

#### Deno KV

**Benchmark Results (2025):**

- **Read latency**: 0.8ms average (product catalog caching workload)
- **Comparison**: Matched or exceeded Redis in read-heavy scenarios
- **Production architecture**: FoundationDB backend optimized for minimal
  latency with 1-2 network round trips per transaction
- **Live benchmarks**: Official Deno benchmarks compare favorably against
  Upstash Redis, AWS DynamoDB, Cloudflare Workers KV, and Google Firestore

**Key Performance Characteristics:**

- **Write latency**: Consistently leads in write latencies among serverless
  databases
- **Throughput**: Millions of operations per second capability
- **Network optimization**: Global edge deployment minimizes latency for
  geographically distributed users

**Disadvantages:**

- **Local SQLite performance**: Local development backend may not reflect
  production performance characteristics
- **Index performance**: Manual secondary indexes may be less optimized than
  native Redis data structures
- **Limited query capabilities**: No native support for complex aggregations or
  range queries on non-key fields

**Sources:**

- [Real-World Caching Benchmarks in 2025](https://andikads.cloud/articles/deno-kv-outpaces-redis-real-world-caching-benchmarks-in-2025)
- [Deno KV vs. Cloudflare Workers KV, Upstash Redis, AWS DynamoDB, and Google
  Firestore](https://deno.com/blog/comparing-deno-kv)
- [Deno KV Benchmarks Repository](https://github.com/denoland/deno-kv-benchmarks)

#### Valkey

**Performance Characteristics:**

- **Read latency**: 1.1ms average (Redis comparison in same benchmark)
- **Mature optimizations**: Decades of performance optimization in Redis/Valkey
  codebase
- **Native data structures**: Sorted sets, hashes optimized at C implementation
  level
- **Predictable performance**: Well-understood performance characteristics
  across all environments

**Disadvantages:**

- **Network overhead**: Separate process requires network round trips even in
  local deployments
- **Memory constraints**: In-memory architecture requires careful capacity
  planning
- **Persistence trade-offs**: RDB snapshots can impact performance during save
  operations

## Data Structure Considerations

### Current Grchat Requirements

Grchat's database schema (per `architecture/DATABASE_SCHEMA.md`) requires:

1. **Hashes**: For storing Nostr event fields (kind 11 and 1111 events)
2. **Sorted sets**: For timeline indexes and thread response indexes (sorted by
   timestamp)
3. **Sets**: For user allowlist
4. **Strings with TTL**: For session state

### Deno KV Implementation Strategy

While Deno KV lacks native Redis data structures, these can be implemented using
key patterns:

#### Hashes → Key-Value Pairs

```typescript
// Valkey: HSET chat.message.abc123 id abc123 pubkey def456 ...
// Deno KV equivalent:
await kv.set(["chat", "message", "abc123", "id"], "abc123");
await kv.set(["chat", "message", "abc123", "pubkey"], "def456");
// Or store entire object:
await kv.set(["chat", "message", "abc123"], {
  id: "abc123",
  pubkey: "def456",
  /* ... */
});
```

#### Sorted Sets → Secondary Indexes

```typescript
// Valkey: ZADD index.messages.timeline 1609459200 abc123
// Deno KV equivalent using lexicographic ordering:
const timestamp = 1609459200;
await kv.set(["index", "messages", "timeline", timestamp, "abc123"], true);

// Query chronologically:
const entries = kv.list({ prefix: ["index", "messages", "timeline"] });
```

**Source:**
[Deno KV Secondary Indexes](https://docs.deno.com/deploy/kv/secondary_indexes/)

#### Sets → Key Prefixes

```typescript
// Valkey: SADD admin.allowlist pubkey1 pubkey2
// Deno KV equivalent:
await kv.set(["admin", "allowlist", "pubkey1"], true);
await kv.set(["admin", "allowlist", "pubkey2"], true);

// Check membership:
const exists = await kv.get(["admin", "allowlist", "pubkey1"]);
```

#### Strings with TTL → Direct Support

```typescript
// Valkey: SETEX session.pubkey123 86400 "session-data"
// Deno KV equivalent:
await kv.set(["session", "pubkey123"], "session-data", {
  expireIn: 86400000,
}); // milliseconds
```

### Implementation Trade-offs

**Advantages of Deno KV patterns:**

- Built-in TTL support with millisecond precision
- Atomic transactions across multiple keys
- Type safety with TypeScript

**Disadvantages of Deno KV patterns:**

- More verbose than Redis commands
- Manual index maintenance (no automatic sorted set updates)
- Potential for inconsistency if index updates are not atomic
- Higher storage overhead (multiple keys instead of one hash)

## Recommended Architecture: Dual-Database Support

### Strategy

Implement an **abstraction layer** that supports both Valkey and Deno KV as
backend implementations, allowing developers and operators to choose based on
deployment context.

### Implementation Approach

1. **Define database interface**: Create a TypeScript interface defining all
   database operations used by grchat
2. **Implement Valkey adapter**: Existing `ValkeyClient` class (already in
   `shared/valkey-client.ts`)
3. **Implement Deno KV adapter**: New adapter implementing the same interface
   using Deno KV patterns
4. **Configuration-based selection**: Environment variable controls which
   backend to use
5. **Shared test suite**: BDD tests run against both implementations to ensure
   behavioral parity

### Use Case Mapping

| Use Case                            | Recommended Database | Rationale                                                  |
| ----------------------------------- | -------------------- | ---------------------------------------------------------- |
| Local development without Docker    | Deno KV              | Zero configuration, no Docker dependency                   |
| Local development with Docker       | Valkey               | Production parity, full data structure support             |
| Unit/integration testing            | Deno KV              | Faster test execution, no container orchestration          |
| Deno Deploy serverless              | Deno KV              | Native integration, automatic scaling, global distribution |
| Self-hosted VPS (single region)     | Either               | Deno KV simpler, Valkey more mature tooling                |
| Large-scale production (multi-node) | Valkey               | Proven clustering, fine-grained operational control        |
| Multi-region production             | Deno KV (Deploy)     | Built-in global replication                                |
| Air-gapped/offline deployments      | Valkey               | No external platform dependency                            |
| Embedded/edge deployments           | Deno KV              | No separate database server, smaller footprint             |

### Migration Path

Phase 1: **Abstraction Layer**

- Define `DatabaseService` interface
- Refactor `ValkeyClient` to implement interface
- Update existing code to use interface

Phase 2: **Deno KV Implementation**

- Create `DenoKvClient` implementing `DatabaseService`
- Implement key pattern translations for hashes, sorted sets, sets
- Add configuration switching

Phase 3: **Testing and Validation**

- Create shared BDD test suite
- Verify behavioral parity
- Document performance characteristics of each backend

Phase 4: **Documentation**

- Update deployment documentation
- Provide configuration examples
- Document trade-offs for each backend choice

## Conclusion

Both Deno KV and Valkey are viable database solutions for grchat, each with
distinct strengths:

**Deno KV excels at:**

- Local development simplicity
- Serverless deployment
- Global distribution on Deno Deploy
- Zero configuration workflows
- Performance in read-heavy workloads

**Valkey excels at:**

- Advanced data structure support
- Operational maturity and tooling
- Self-hosted scalability with fine-grained control
- Production parity across all environments

**Recommendation:** Implement dual-database support with a clean abstraction
layer. This maximizes flexibility, enabling:

- Frictionless local development with Deno KV
- Powerful production deployments with either backend based on operational
  requirements
- Future optionality as the project scales

The abstraction layer investment pays dividends by preventing vendor lock-in and
enabling the right database choice for each deployment context.

---

## Sources

- [Deno KV - A Global Database for Global Apps](https://deno.com/kv)
- [Deno KV Quick Start](https://docs.deno.com/deploy/kv/)
- [Deno KV Internals: Building a Database for the Modern
  Web](https://deno.com/blog/building-deno-kv)
- [KV on Deno Deploy](https://docs.deno.com/deploy/kv/manual/on_deploy/)
- [Deno KV Secondary Indexes](https://docs.deno.com/deploy/kv/secondary_indexes/)
- [Real-World Caching Benchmarks in 2025](https://andikads.cloud/articles/deno-kv-outpaces-redis-real-world-caching-benchmarks-in-2025)
- [Deno KV vs. Cloudflare Workers KV, Upstash Redis, AWS DynamoDB, and Google
  Firestore](https://deno.com/blog/comparing-deno-kv)
- [Deno KV Benchmarks Repository](https://github.com/denoland/deno-kv-benchmarks)
- [Use Deno KV in Node with the New Official npm
  Package](https://deno.com/blog/kv-npm)
- [Announcing Deno KV](https://deno.com/blog/kv)
- [Valkey Documentation](https://valkey.io/topics/hashes/)
