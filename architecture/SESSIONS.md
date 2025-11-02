# Sessions

Grchat requires authentication to both read and write. There is no concept of a "read-only session" - unauthenticated users cannot access chat content.

An authenticated session begins when the user successfully authenticates via NIP-46, and ends when the user signs out, the session expires, or the keepalive mechanism fails.

## Authentication

Authentication is accomplished via a [NIP-46](https://github.com/nostr-protocol/nips/blob/master/46.md) handshake between Grchat and the user's signer application.

### Handshake

This handshake is initiated in one of two ways:

1. Grchat presents a `nostrconnect://` URL as a QR code and a string that may be copied to the user's clipboard.
2. The user pastes a `bunker://` URL into a text field in Grchat.

### Session State

Once the NIP-46 handshake is complete, the Grchat server stores a session for the user containing the following:

- The user's public key
- The remote signer application's public key
- One or more relay URLs on which the user's remote signer application is listening
- A Unix timestamp indicating the user's session expiration
- NIP-42 challenge state (succeeded/failed)

The server persists session state to the Valkey database as a CSV-formatted string. The time-to-live (TTL) of session state Valkey entries is 24 hours from session creation.

### Multi-Device Sessions

A single user may authenticate from multiple devices simultaneously. All sessions for a given user are tracked using the same public key. From the application's perspective, multiple devices authenticated with the same public key constitute a single logical session - messages sent from any device appear under the same user identity, and session state is shared across all devices.

### Keepalive

User sessions expire 24 hours after the initial authentication handshake. The expiration timestamp is computed on handshake completion and stored in the server session state.

Once every 60 seconds, the Grchat server sends a `ping` message (per NIP-46) to the remote signer for each _living_ session to ensure it is still listening for connections. If the remote signer does not respond with a `pong` message, the Grchat server considers the session to have expired and it immediately deletes the session state entry from the Valkey database.

**Session Expiration Precedence**: Keepalive failures take precedence over the Valkey TTL. If a keepalive ping fails, the session is terminated immediately regardless of how much time remains on the 24-hour TTL. The Valkey TTL serves as a backup garbage collection mechanism to ensure session state does not persist indefinitely if the keepalive mechanism fails.

### Session Renewal

A session is considered to be expired when the session state cannot be found in the Valkey database. When a user attempts to perform an action that requires authorization within an expired session, Grchat prompts the user to re-initialize the authentication handshake.

**User Experience**: On session re-initialization, all current application state is lost. This includes:

- Any message currently being typed
- Current navigation state (which thread is being viewed)
- Scroll position

This behavior may be improved in future iterations to preserve user context during re-authentication.

## Authorization

_Grchat requires authorization to both read and write._

### Read Authorization

Users are authorized to _read_ on the basis of a whitelist initialized from the server configuration and stored in the Valkey database. If a user's public key is on the whitelist, the user is issued a challenge according to [NIP-42](https://github.com/nostr-protocol/nips/blob/master/42.md).

**NIP-42 Challenge Flow**:

- Challenges are issued **per-session** (not per-request)
- Each session receives exactly one challenge after successful NIP-46 authentication
- Challenge state (succeeded/failed) is serialized in the session state
- Challenge timeout is **6 hours** from issuance
- If the challenge times out, the session ends and the session state is deleted from the database.

The user's remote signer must sign the challenge event, and the server will verify the event signature corresponds to the user's public key. A user is allowed to read Nostr events from the database if and only if both of the following conditions are met:

- The NIP-42 challenge succeeds.
- The user's public key is on the whitelist stored in the database.

### Write Authorization

A user authorizes grchat to _write_ to the database on the user's behalf. This authorization is accomplished by the server sending a user-authored Nostr event to the user's remote signer application to be signed. The event is persisted to the database if and only if both of the following conditions are met:

- The user public key on the event matches the user public key of an active session.
- The signature on the event is cryptographically verified against the public key on the event.

## Implementation Guidance

Core authentication and authorization code should be written in the application's service layer. It may be used both by server functions for direct calls from UI components and by code on API endpoints.

Session state forms a part of the application's domain logic.
