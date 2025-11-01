# Sessions

A user of Grchat may participate in either of two types of sessions:

1. A read-only session: begins when the user loads the Grchat web app, and ends when the user either leaves Grchat or authenticates.
2. An authenticated session: begins when the user authenticates, and ends when the user signs out or leaves Grchat.

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

The server persists session state to the Valkey database. The time-to-live (TTL) of session state Valkey entries corresponds to the expiration timestamp.

### Keepalive

User sessions expire 24 hours after the initial authentication handshake. The expiration timestamp is computed on handshake completion and stored in the server session state.

Once every 60 seconds, the Grchat server sends a `ping` message (per NIP-46) to the remote signer for each _living_ session to ensure it is still listening for connections. If the remote signer does not respond with a `pong` message, the Grchat server considers the session to have expired and it deletes the session state entry from the Valkey database.

### Session Renewal

A session is considered to be expired when the session state cannot be found in the Valkey database. When a user attempts to perform an action that requires authorization within an expired session, Grchat prompts the user to re-initialize the authentication handshake.

## Authorization

_Grchat requires authorization to both read and write._

### Read Authorization

Users are authorized to _read_ on the basis of a whitelist initialized from the server configuration and stored in the Valkey database. If a user's public key is on the whitelist, the user is issued a challenge according to [NIP-42](https://github.com/nostr-protocol/nips/blob/master/42.md). The user's remote signer must sign the challenge event, and the server will verify the event signature corresponds to the user's public key. A user is allowed to read Nostr events from the database if and only if both of the following conditions are met:

- The NIP-42 challenge succeeds.
- The user's public key is on the whitelist stored in the database.

### Write Authorization

A user authorizes grchat to _write_ to the database on the user's behalf. This authorization is accomplished by the server sending a user-authored Nostr event to the user's remote signer application to be signed. The event is persisted to the database if and only if both of the following conditions are met:

- The user public key on the event matches the user public key of an active session.
- The signature on the event is cryptographically verified against the public key on the event.

## Implementation Guidance

Core authentication and authorization code should be written in the application's service layer. It may be used both by server functions for direct calls from UI components and by code on API endpoints.

Session state forms a part of the application's domain logic.
