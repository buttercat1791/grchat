# Authentication Services Integration Guide

This document summarizes the service interfaces implemented to support authentication, authorization, and session management. It provides integration guidance for incorporating these services into the broader application.

## Overview

The authentication-services branch implements the complete authentication and session management stack for Grchat, including:

- NIP-46 remote signing for user authentication
- WebSocket relay pool for Nostr relay communication
- Session state management with Valkey persistence
- Keepalive service to maintain session liveness
- Enhanced cryptographic operations
- Message schema validation

## Service Interfaces

### 1. NIP-46 Authentication Service

**Location**: `services/nip46-auth.ts`

**Purpose**: Manages user authentication via NIP-46 remote signing protocol, supporting both client-initiated (nostrconnect://) and signer-initiated (bunker://) flows.

#### Public API

##### Class: `Nip46Service`

```typescript
class Nip46Service {
  constructor(relayPool: RelayPool);

  // Client-initiated flow (nostrconnect://)
  generateNostrconnectUrl(
    relayUrls: string[],
    metadata?: AppMetadata,
  ): NostrconnectResult;

  awaitHandshake(
    connectionData: Omit<Nip46Connection, "signerPubkey">,
    timeout?: number,
  ): Promise<HandshakeResult>;

  // Signer-initiated flow (bunker://)
  parseBunkerUrl(bunkerUrl: string): Nip46Connection;

  completeHandshake(connection: Nip46Connection): Promise<HandshakeResult>;

  // Remote signer operations
  ping(connection: Nip46Connection, timeout?: number): Promise<boolean>;

  requestSignEvent(
    connection: Nip46Connection,
    event: NostrEventBase,
  ): Promise<NostrEvent>;
}
```

##### Factory Function

```typescript
function createNip46Service(relayPool: RelayPool): Nip46Service;
```

#### Key Types

```typescript
interface Nip46Connection {
  clientSecretKey: string; // Ephemeral secret key
  clientPubkey: string; // Ephemeral public key
  signerPubkey: string; // Remote signer's public key
  relayUrls: string[]; // Relay URLs
  secret?: string; // Optional handshake secret
}

interface HandshakeResult {
  userPubkey: string; // User's actual public key
  connection: Nip46Connection; // Complete connection state
}

interface NostrconnectResult {
  url: string; // The nostrconnect:// URL
  connection: Omit<Nip46Connection, "signerPubkey">;
}

interface AppMetadata {
  name?: string; // Application name
  url?: string; // Application URL
  image?: string; // Application icon URL
  perms?: string; // Requested permissions
}
```

#### Integration Points

1. **Client-Initiated Login Flow**: Use `generateNostrconnectUrl()` to create a URL for users to scan to initiate a remote signer connection
2. **Handshake Completion**: Use `awaitHandshake()` to wait for a remote signer response to the client-initiated login flow
3. **Bunker URL Flow**: Use `parseBunkerUrl()` and `completeHandshake()` to complete the conneciton with a remote signer in the signer-initiated login flow
4. **Event Signing**: Use `requestSignEvent()` to request event signatures from remote signer
5. **Connection Monitoring**: Use `ping()` to verify connection health

---

### 2. Relay Pool Service

**Location**: `services/relay-pool.ts`

**Purpose**: Manages WebSocket connections to Nostr relays with connection pooling, subscription management, and automatic reconnection.

#### Public API

##### Class: `RelayPool`

```typescript
class RelayPool implements Disposable {
  constructor(config?: RelayPoolConfig);

  // Connection management
  connect(url: string): Promise<void>;
  disconnect(url: string): void;
  close(): void;

  // Subscription operations
  subscribe(
    url: string,
    filters: NostrFilter[],
    callback: (event: NostrEvent) => void,
  ): Promise<string>;

  unsubscribe(url: string, subId: string): void;

  // Event operations
  publish(
    url: string,
    event: NostrEvent,
  ): Promise<{ success: boolean; message: string }>;

  fetchEvent(url: string, filters: NostrFilter[]): Promise<NostrEvent | null>;

  // Message handlers
  addMessageHandler(
    url: string,
    handler: (message: RelayMessage) => void,
  ): void;

  removeMessageHandler(
    url: string,
    handler: (message: RelayMessage) => void,
  ): void;

  // Status queries
  getState(
    url: string,
  ): "connecting" | "connected" | "disconnected" | undefined;
  getConnectedRelays(): string[];

  // Disposable interface
  [Symbol.dispose](): void;
}
```

##### Factory Function

```typescript
function buildRelayPool(config?: RelayPoolConfig): RelayPool;
```

#### Key Types

```typescript
interface RelayPoolConfig {
  maxConnectionsPerRelay?: number; // Default: 3
  connectionTimeout?: number; // Default: 10000ms
  idleTimeout?: number; // Default: 300000ms (5 min)
}

interface NostrFilter {
  ids?: string[];
  authors?: string[];
  kinds?: number[];
  since?: number;
  until?: number;
  limit?: number;
  // Plus arbitrary tag filters (#e, #p, etc.)
}
```

#### Integration Points

1. **Initialization**: Create a single shared `RelayPool` instance for the application
2. **NIP-46 Communication**: Used internally by `Nip46Service` to exchange message with the remote signer
3. **Resource Management**: Use `using` directive or call `close()` on shutdown

---

### 3. Session Manager Service

**Location**: `services/session-manager.ts`

**Purpose**: Manages user session state in Valkey, including creation, retrieval, validation, and deletion.

#### Public API

##### Class: `SessionManager`

```typescript
class SessionManager {
  constructor(valkeyClient: ValkeyClient);

  // Session lifecycle
  createSession(
    connection: Nip46Connection,
    userPubkey: string,
  ): Promise<SessionState>;

  getSession(userPubkey: string): Promise<SessionState | null>;

  updateSession(session: SessionState): Promise<void>;

  deleteSession(userPubkey: string): Promise<void>;

  // Session validation
  validateSession(userPubkey: string): Promise<SessionValidation>;

  sessionExists(userPubkey: string): Promise<boolean>;

  getSessionTTL(userPubkey: string): Promise<number | null>;

  // NIP-42 challenge state management
  markChallengeSucceeded(userPubkey: string): Promise<void>;

  markChallengeFailed(userPubkey: string): Promise<void>;
}
```

##### Factory Function

```typescript
function createSessionManager(valkeyClient: ValkeyClient): SessionManager;
```

#### Key Types

```typescript
interface SessionState {
  userPubkey: string; // User's public key (32-byte hex)
  signerPubkey: string; // Remote signer's public key
  relayUrls: string[]; // Relay URLs for signer communication
  expiresAt: string; // ISO datetime (24 hours from creation)
  challengeState: "pending" | "succeeded" | "failed";
  challengeIssuedAt?: string; // ISO datetime when challenge was issued
}

interface SessionValidation {
  valid: boolean;
  session?: SessionState;
  reason?: "not_found" | "expired" | "invalid_format";
}
```

#### Utility Functions

```typescript
// Session validation helpers
function isSessionValid(session: SessionState): boolean;
function isChallengeValid(session: SessionState): boolean;
function isAuthorizedToRead(session: SessionState): boolean;

// Session creation
function buildSessionState(
  userPubkey: string,
  signerPubkey: string,
  relayUrls: string[],
): SessionState;
```

#### Integration Points

1. **Post-Authentication**: Call `createSession()` after successful NIP-46 handshake
2. **Request Middleware**: Use `validateSession()` to check session validity on each user-requested action
3. **Authorization**: Use `isAuthorizedToRead()` to check if user can read messages
4. **Logout**: Call `deleteSession()` when user logs out
5. **Session Storage**: Sessions are stored in Valkey with 24-hour TTL

---

### 4. Keepalive Service

**Location**: `services/keepalive.ts`

**Purpose**: Maintains session liveness by periodically pinging remote signers. Uses a Web Worker for background timing while the main thread handles user-requested actions.

#### Public API

##### Class: `KeepaliveService`

```typescript
class KeepaliveService implements Disposable {
  constructor(
    nip46Service: Nip46Service,
    sessionManager: SessionManager,
    options?: {
      onSessionFailed?: (userPubkey: string, reason: string) => void;
    },
  );

  // Service lifecycle
  start(): Promise<void>;
  stop(): void;

  // Session tracking
  trackSession(userPubkey: string, connection: Nip46Connection): void;
  untrackSession(userPubkey: string): void;

  // Query methods
  getTrackedSessions(): string[];
  isTracking(userPubkey: string): boolean;

  // Disposable interface
  [Symbol.dispose](): void;
}
```

##### Factory Function

```typescript
function createKeepaliveService(
  nip46Service: Nip46Service,
  sessionManager: SessionManager,
  options?: {
    onSessionFailed?: (userPubkey: string, reason: string) => void;
  },
): KeepaliveService;
```

#### Configuration

- **Ping Interval**: 60 seconds (defined in worker)
- **Max Consecutive Failures**: 3 (defined in worker)
- **Failure Action**: Automatically deletes session from Valkey

#### Integration Points

1. **Initialization**: Create and start keepalive service on server startup
2. **Post-Login**: Call `trackSession()` after successful NIP-46 authentication and session start
3. **Logout**: Call `untrackSession()` when user logs out
4. **Failure Callback**: Register `onSessionFailed` to handle disconnections due to keepalive failures
5. **Shutdown**: Call `stop()` or use `using` directive on server shutdown

---

### 5. Enhanced Valkey Client

**Location**: `services/valkey-client.ts`

**Purpose**: Provides type-safe wrapper around Valkey GLIDE client with common operations.

#### Public API (New Methods)

```typescript
class ValkeyClient implements Disposable {
  // String operations
  getString(key: string): Promise<string | null>;
  setWithTTL(key: string, value: string, ttl: number): Promise<boolean>;

  // Key operations
  delete(key: string): Promise<boolean>;
  hasKey(key: string): Promise<boolean>;
  ttl(key: string): Promise<number | null>;
}
```

#### Integration Points

1. **Database CRUD Operations**: Use `ValkeyClient` for all database CRUD operations
2. **Resource Management**: Implements `Disposable` for cleanup

---

### 6. Nostr Message Schemas

**Location**: `schemas/nostr-messages.ts`

**Purpose**: Provides Zod schemas for NIP-01 WebSocket message validation.

#### Key Schemas

##### Client Messages

```typescript
// ["EVENT", <event>]
type ClientEventMessage = z.infer<typeof ClientEventMessageSchema>;

// ["REQ", <sub_id>, <filter1>, ...]
type ClientReqMessage = z.infer<typeof ClientReqMessageSchema>;

// ["CLOSE", <sub_id>]
type ClientCloseMessage = z.infer<typeof ClientCloseMessageSchema>;

type ClientMessage = z.infer<typeof ClientMessageSchema>;
```

##### Relay Messages

```typescript
// ["EVENT", <sub_id>, <event>]
type RelayEventMessage = z.infer<typeof RelayEventMessageSchema>;

// ["EOSE", <sub_id>]
type RelayEoseMessage = z.infer<typeof RelayEoseMessageSchema>;

// ["OK", <event_id>, <accepted>, <message>]
type RelayOkMessage = z.infer<typeof RelayOkMessageSchema>;

// ["NOTICE", <message>]
type RelayNoticeMessage = z.infer<typeof RelayNoticeMessageSchema>;

// ["AUTH", <challenge>]
type RelayAuthMessage = z.infer<typeof RelayAuthMessageSchema>;

type RelayMessage = z.infer<typeof RelayMessageSchema>;
```

#### Integration Points

1. **Nostr Event Validation**: Use schemas to validate incoming/outgoing Nostr events
2. **Type Safety**: Import types for TypeScript type checking
3. **Relay Implementation**: Use message schemas when implementing relay endpoints

---

## Integration Workflow

### 1. Application Startup

```typescript
// Initialize core services
const valkeyClient = new ValkeyClient(valkeyConfig);
await valkeyClient.connect();

const relayPool = buildRelayPool({
  connectionTimeout: 10000,
  idleTimeout: 300000,
});

const nip46Service = createNip46Service(relayPool);
const sessionManager = createSessionManager(valkeyClient);

const keepaliveService = createKeepaliveService(nip46Service, sessionManager, {
  onSessionFailed: (userPubkey, reason) => {
    console.log(`Session failed for ${userPubkey}: ${reason}`);
    // Notify user, trigger re-auth, etc.
  },
});

await keepaliveService.start();
```

### 2. User Authentication (Client-Initiated)

```typescript
// Generate nostrconnect:// URL
const relayUrls = ["wss://relay.example.com"];
const appMetadata = {
  name: "Grchat",
  url: "https://grchat.example.com",
};

const { url, connection } = nip46Service.generateNostrconnectUrl(
  relayUrls,
  appMetadata,
);

// Display URL as QR code to user
// ...

// Wait for signer response (with 30s timeout)
try {
  const { userPubkey, connection: fullConnection } =
    await nip46Service.awaitHandshake(connection, 30000);

  // Create session
  const session = await sessionManager.createSession(
    fullConnection,
    userPubkey,
  );

  // Start tracking for keepalive
  keepaliveService.trackSession(userPubkey, fullConnection);

  // Redirect to chat
  // ...
} catch (error) {
  // Handle timeout or failure
  console.error("Authentication failed:", error);
}
```

### 3. User Authentication (Signer-Initiated)

```typescript
// User provides bunker:// URL
const bunkerUrl = "bunker://...";

try {
  const connection = nip46Service.parseBunkerUrl(bunkerUrl);
  const { userPubkey, connection: fullConnection } =
    await nip46Service.completeHandshake(connection);

  // Create session and track
  const session = await sessionManager.createSession(
    fullConnection,
    userPubkey,
  );
  keepaliveService.trackSession(userPubkey, fullConnection);

  // Redirect to chat
} catch (error) {
  console.error("Authentication failed:", error);
}
```

### 5. User Logout

```typescript
async function logout(userPubkey: string): Promise<void> {
  // Stop tracking for keepalive
  keepaliveService.untrackSession(userPubkey);

  // Delete session from Valkey
  await sessionManager.deleteSession(userPubkey);

  // Redirect to login
  // ...
}
```

### 6. Application Shutdown

```typescript
// Stop keepalive service
keepaliveService.stop();

// Close relay connections
relayPool.close();

// Disconnect from Valkey
valkeyClient.disconnect();
```

## Error Handling

### Service-Specific Errors

Each service defines custom error classes:

- `Nip46Error` - NIP-46 authentication failures
- `RelayError` - Relay connection/communication failures
- `SessionError` - Session management failures
- `KeepaliveError` - Keepalive service failures
- `CryptoError` - Cryptographic operation failures

### Error Propagation

Services propagate errors with context via the `cause` option:

```typescript
try {
  // Service operation
} catch (error) {
  throw new ServiceError("High-level description", { cause: error });
}
```

## Architecture Notes

### Stateless vs Stateful Services

**Stateless**:

- `Nip46Service` (relay pool is injected)
- `SessionManager` (Valkey client is injected)

**Stateful**:

- `RelayPool` (maintains WebSocket connections)
- `KeepaliveService` (tracks sessions and manages worker)
- `ValkeyClient` (maintains database connection)

### Resource Cleanup

All stateful services implement the `Disposable` interface:

```typescript
// Recommended usage
using relayPool = buildRelayPool();
using keepalive = createKeepaliveService(nip46, sessionMgr);

// Or explicit cleanup
try {
  // Use services
} finally {
  keepalive.stop();
  relayPool.close();
}
```

## Migration Checklist

When integrating authentication-services into main:

- [ ] Add keepalive worker to build
- [ ] Create login handlers that hook into user actions on the Fresh UI
- [ ] Add session validation to protected user actions
- [ ] Ensure users are redirected to the `/login` route if session validation fails or the keepalive service closes the session
