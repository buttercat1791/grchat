# Database Schema

Valkey is structured as a key-value store, so it does not have a schema as complex as would be found in a relational database; however, the key-value pairings used by grchat are defined here to set development standards.

## Chat Message Events

- **Key structure:** `chat.message.<message-event-id>`
- **Value type:** [hash](https://valkey.io/topics/hashes/)
- **Contents:** Kind 11 Nostr event structured as a hash
- **Time to live:** 90 days

### Hash Fields

Per [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md) and [NIP-7D](https://github.com/nostr-protocol/nips/blob/master/7D.md):

- `id` - Event ID (32-byte lowercase hex-encoded sha256 of the serialized event data)
- `pubkey` - Author's public key (32-byte lowercase hex-encoded public key)
- `created_at` - Unix timestamp in seconds
- `kind` - Event kind (integer, must be 11 for chat messages)
- `tags` - JSON-serialized array of tags
- `content` - Message content (arbitrary string)
- `sig` - Event signature (64-byte lowercase hex of the signature of the sha256 hash of the serialized event data)

## Threaded Response Events

- **Key structure:** `chat.message.<root-event-id>.thread.<response-event-id>`
- **Value type:** [hash](https://valkey.io/topics/hashes/)
- **Contents:** Kind 1111 Nostr event structured as a hash
- **Time to live:** 90 days

### Hash Fields

Per [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md) and [NIP-7D](https://github.com/nostr-protocol/nips/blob/master/7D.md):

- `id` - Event ID (32-byte lowercase hex-encoded sha256 of the serialized event data)
- `pubkey` - Author's public key (32-byte lowercase hex-encoded public key)
- `created_at` - Unix timestamp in seconds
- `kind` - Event kind (integer, must be 1111 for threaded responses)
- `tags` - JSON-serialized array of tags (must include `e` tag referencing root event)
- `content` - Message content (arbitrary string)
- `sig` - Event signature (64-byte lowercase hex of the signature of the sha256 hash of the serialized event data)

## Session State

- **Key structure:** `session.<public-key>`
- **Value type:** [string](https://valkey.io/topics/strings/)
- **Contents:** Serialized session data
- **Time to live:** 24 hours

## User Allowlist

- **Key structure:** `admin.allowlist`
- **Value type:** [set](https://valkey.io/topics/sets/)
- **Contents:** Set of allowed Nostr user public keys
- **Time to live:** forever

## Secondary Indices

### Message Timeline Index

- **Key structure:** `index.messages.timeline`
- **Value type:** [sorted set](https://valkey.io/topics/sorted-sets/)
- **Contents:** Chat message event IDs scored by their `created_at` timestamp
- **Purpose:** Efficient chronological queries for displaying messages in the chat view
- **Time to live:** 90 days

### Thread Response Index

- **Key structure:** `index.threads.<root-event-id>`
- **Value type:** [sorted set](https://valkey.io/topics/sorted-sets/)
- **Contents:** Threaded response event IDs scored by their `created_at` timestamp
- **Purpose:** Efficient retrieval of all responses to a given root message in chronological order
- **Time to live:** 90 days
