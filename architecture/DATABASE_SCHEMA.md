# Database Schema

Valkey is structured as a key-value store, so it does not have a schema as complex as would be found in a relational database; however, the key-value pairings used by grchat are defined here to set development standards.

## Chat Message Events

- **Key structure:** `chat.message.<message-event-id>`
- **Value type:** [hash](https://valkey.io/topics/hashes/)
- **Contents:** Kind 11 Nostr event structured as a hash

## Threaded Response Events

- **Key structure:** `chat.message.<root-event-id>.thread.<response-event-id>`
- **Value type:** [hash](https://valkey.io/topics/hashes/)
- **Contents:** Kind 1111 Nostr event structured as a hash

## Session State

- **Key structure:** `session.<public-key>`
- **Value type:** [string](https://valkey.io/topics/strings/)
- **Contents:** Serialized session data

## User Allowlist

- **Key structure:** `admin.allowlist`
- **Value type:** [set](https://valkey.io/topics/sets/)
- **Contents:** Set of allowed Nostr user public keys
