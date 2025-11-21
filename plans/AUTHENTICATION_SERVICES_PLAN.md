# Authentication Services Implementation Plan

**Status: COMPLETED**

This document outlines the implementation plan for Phase 2.1 of the grchat project: Authentication Services.

## Overview

Authentication services enable users to authenticate with grchat using NIP-46 remote signing. This involves three main services:

1. **NIP-46 Remote Signing Service** - Handles the handshake protocol with remote signers
2. **Session Management Service** - Manages user sessions in Valkey
3. **Keepalive Service** - Maintains session liveness via periodic pings

## Dependencies and Prerequisites

### Existing Components (Phase 1)
- `services/valkey-client.ts` - Valkey database client
- `services/nostr/crypto.ts` - Nostr cryptography service (signing, verification)
- `schemas/session.ts` - Session state Zod schema and validators
- `schemas/nostr.ts` - Nostr event schemas
- `schemas/codecs.ts` - Serialization codecs including `sessionModelToCsv`

### New Dependencies Required

#### NIP-44 Encryption
NIP-46 requires NIP-44 encrypted communication. The noscrypt FFI library does not currently expose NIP-44 encryption functions. Options:
1. **Add NIP-44 FFI bindings** - If noscrypt supports NIP-44, add FFI wrappers
2. **Pure TypeScript implementation** - Implement NIP-44 using Web Crypto API and `@noble/secp256k1`

**Decision**: Use `@noble/ciphers` and `@noble/curves` for NIP-44 encryption. These are well-audited pure JavaScript implementations that work with Deno.

## Service Specifications

### 1. NIP-46 Remote Signing Service (`services/nip46-auth.ts`)

#### Responsibilities
- Generate `nostrconnect://` URLs for client-initiated connections
- Parse `bunker://` URLs for signer-initiated connections
- Manage NIP-46 request/response communication over relays
- Handle encryption/decryption of NIP-46 messages using NIP-44

#### Key Types
```typescript
interface Nip46Connection {
  clientSecretKey: string;  // Ephemeral keypair for this connection
  clientPubkey: string;
  signerPubkey: string;
  relayUrls: string[];
  secret?: string;          // Optional handshake secret
}

interface Nip46Request {
  id: string;
  method: string;
  params: string[];
}

interface Nip46Response {
  id: string;
  result?: string;
  error?: string;
}
```

#### Functions
- `generateNostrconnectUrl(relayUrls: string[], appMetadata?: AppMetadata): NostrconnectResult`
  - Generates ephemeral keypair for the connection
  - Creates `nostrconnect://` URL with client pubkey and metadata
  - Returns URL and connection state for tracking

- `parseBunkerUrl(bunkerUrl: string): Nip46Connection`
  - Parses `bunker://` URL to extract signer pubkey, relays, and secret
  - Generates ephemeral client keypair
  - Returns connection state

- `sendRequest(connection: Nip46Connection, request: Nip46Request): Promise<Nip46Response>`
  - Encrypts request using NIP-44
  - Publishes kind 24133 event to relay
  - Subscribes for response
  - Decrypts and returns response

- `completeHandshake(connection: Nip46Connection): Promise<HandshakeResult>`
  - Sends `get_public_key` request to retrieve user's actual public key
  - Validates the response
  - Returns user pubkey and connection details for session creation

#### NIP-44 Encryption Module (`services/nip44-crypto.ts`)
- `deriveConversationKey(privateKey: string, publicKey: string): Uint8Array`
- `encrypt(plaintext: string, conversationKey: Uint8Array): string`
- `decrypt(ciphertext: string, conversationKey: Uint8Array): string`

### 2. Session Management Service (`services/session-manager.ts`)

#### Responsibilities
- Create sessions after successful NIP-46 handshake
- Retrieve sessions from Valkey by user public key
- Check session expiration status
- Delete sessions on logout or expiration
- Track multi-device sessions (same user, multiple devices)

#### Key Types
```typescript
interface SessionManagerConfig {
  sessionTtlHours?: number;  // Default: 24
}
```

#### Functions
- `createSession(connection: Nip46Connection, userPubkey: string): Promise<SessionState>`
  - Builds session state using `buildSessionState()` from schemas
  - Serializes using `sessionModelToCsv` codec
  - Writes to Valkey with key `session.<public-key>`
  - Sets TTL to 24 hours

- `getSession(userPubkey: string): Promise<SessionState | null>`
  - Reads from Valkey key `session.<public-key>`
  - Deserializes using `sessionModelToCsv` codec
  - Validates session hasn't expired
  - Returns null if session doesn't exist or is invalid

- `updateSession(session: SessionState): Promise<void>`
  - Updates session in Valkey (e.g., after NIP-42 challenge success)
  - Preserves TTL

- `deleteSession(userPubkey: string): Promise<void>`
  - Removes session from Valkey

- `validateSession(userPubkey: string): Promise<SessionValidation>`
  - Checks if session exists and is not expired
  - Returns validation result with status and session if valid

### 3. Keepalive Service (`services/keepalive.ts`)

#### Responsibilities
- Track active sessions requiring keepalive
- Send NIP-46 ping messages every 60 seconds
- Handle pong responses and failures
- Terminate sessions on keepalive failure
- Run as background process on Deno server

#### Key Types
```typescript
interface KeepaliveTracker {
  userPubkey: string;
  connection: Nip46Connection;
  lastPingAt: Date;
  lastPongAt: Date | null;
}
```

#### Functions
- `startKeepalive(userPubkey: string, connection: Nip46Connection): void`
  - Adds session to keepalive tracking
  - Starts ping interval if not already running

- `stopKeepalive(userPubkey: string): void`
  - Removes session from keepalive tracking

- `handlePingCycle(): Promise<void>`
  - Iterates all tracked sessions
  - Sends ping to each remote signer
  - Awaits pong response with timeout
  - Terminates sessions that fail to respond

- `runKeepaliveLoop(): void`
  - Background loop that calls `handlePingCycle()` every 60 seconds
  - Uses Deno.cron or setInterval

## Implementation Order

### Step 1: NIP-44 Crypto Module
Create `services/nip44-crypto.ts`:
- Implement ECDH shared secret derivation using `@noble/curves/secp256k1`
- Implement HKDF key derivation
- Implement ChaCha20-Poly1305 encryption/decryption using `@noble/ciphers`
- Implement message padding per NIP-44 spec
- Write unit tests

### Step 2: NIP-46 Remote Signing Service
Create `services/nip46-auth.ts`:
- Define types and interfaces
- Implement URL generation and parsing
- Implement request/response protocol
- Implement handshake completion
- Write unit tests

### Step 3: Session Management Service
Create `services/session-manager.ts`:
- Implement CRUD operations for sessions
- Integrate with Valkey client
- Use existing session schema and codec
- Write unit tests

### Step 4: Keepalive Service
Create `services/keepalive.ts`:
- Implement session tracking
- Implement ping/pong protocol using NIP-46 service
- Implement background loop
- Integrate with session manager for termination
- Write unit tests

## Error Handling

### Custom Error Types
```typescript
class Nip46Error extends Error { /* NIP-46 protocol errors */ }
class Nip44Error extends Error { /* Encryption/decryption errors */ }
class SessionError extends Error { /* Session management errors */ }
class KeepaliveError extends Error { /* Keepalive failures */ }
```

### Error Scenarios
- Relay connection failures
- Encryption/decryption failures
- Handshake timeouts
- Session not found
- Session expired
- Keepalive ping timeout

## Testing Strategy

### Unit Tests
- NIP-44 encryption/decryption with test vectors
- URL generation and parsing
- Session state serialization roundtrip
- Session validation logic

### Integration Tests (mocked relay)
- Complete handshake flow
- Session creation and retrieval
- Keepalive ping/pong cycle
- Session termination on keepalive failure

## Open Questions

1. **Relay WebSocket Management**: Should we use a shared WebSocket connection pool for relay communication, or create new connections per request?

2. **Session Storage Key Structure**: The current schema uses `session.<public-key>`, but multi-device sessions may need additional tracking. Is the current approach sufficient?

3. **Keepalive Implementation**: Should the keepalive service use `Deno.cron` (requires `--unstable-cron`) or `setInterval`?

## File Structure

```
services/
  nip44-crypto.ts         # NIP-44 encryption module
  nip46-auth.ts           # NIP-46 remote signing service
  session-manager.ts      # Session management service
  keepalive.ts            # Keepalive service
  nostr/
    crypto.ts             # (existing) Nostr crypto operations
```

## Implementation Summary

The following components were implemented:

### Files Created/Modified

1. **`libraries/noscrypt/noscrypt-ffi.ts`** - Extended with NIP-44 encryption functions:
   - `getConversationKey()` - Derives conversation key from keypair
   - `encryptNip44()` - Encrypts plaintext using NIP-44
   - `decryptNip44()` - Decrypts NIP-44 ciphertext

2. **`services/relay-pool.ts`** - WebSocket connection pool:
   - Pooled connections for efficiency
   - Automatic reconnection
   - Subscription management
   - Message routing

3. **`services/nip46-auth.ts`** - NIP-46 Remote Signing Service:
   - `generateNostrconnectUrl()` - Creates client-initiated connection URL
   - `parseBunkerUrl()` - Parses signer-initiated connection URL
   - `awaitHandshake()` / `completeHandshake()` - Completes authentication
   - `sendRequest()` - Sends NIP-46 requests
   - `ping()` - Keepalive ping
   - `requestSignEvent()` - Requests event signing

4. **`services/session-manager.ts`** - Session Management Service:
   - `createSession()` - Creates session after handshake
   - `getSession()` / `validateSession()` - Retrieves and validates sessions
   - `updateSession()` - Updates session state
   - `deleteSession()` - Removes session on logout/expiration
   - `markChallengeSucceeded()` / `markChallengeFailed()` - NIP-42 challenge state

5. **`services/keepalive.ts`** - Keepalive Service:
   - `start()` / `stop()` - Controls the keepalive loop
   - `trackSession()` / `untrackSession()` - Manages tracked sessions
   - Integrates with Web Worker for background timing

6. **`workers/keepalive-worker.ts`** - Background Worker:
   - Runs ping cycle every 60 seconds
   - Tracks consecutive failures
   - Signals session failures to main thread

### Tests Created

- `services/nip46-auth.test.ts` - URL generation and parsing tests
- `services/session-manager.test.ts` - Session model and codec tests

### Design Decisions

- **NIP-44 Encryption**: Extended noscrypt FFI with NIP-44 functions
- **WebSockets**: Pooled connections for relay communication
- **Keepalive**: Web Worker with setInterval for background processing
