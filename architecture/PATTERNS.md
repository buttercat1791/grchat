# Architecture Patterns

An overview of the software architecture patterns used by Grchat. Pattern names and definitions are largely derived from those described in Martin Fowler's _Patterns of Enterprise Application Architecture_.

## Domain Logic

Grchat's domain logic uses the _Transaction Script_ pattern.

- The application data consists entirely of Nostr events.
- The application domain can be modeled as JSON objects that comply with the [NIP-7D](https://github.com/nostr-protocol/nips/blob/master/7D.md) standard.
- The entire application stack uses Nostr events consistently throughout, from the presentation layer through to the database.
- There is no need for _Data Transfer Objects_ and _Data Mappers_.

## Service Layer

Interactions between the presentation and the domain logic are mediated by a _Service Layer_

- The service layer consists of TypeScript modules defined in the [services/](./services) directory.
- The Fresh UI presentation layer and the Nostr relay API surface both engage with domain logic via the shared service layer.

## Web Presentation

The web presentation layer is built using [Fresh](https://fresh.deno.dev/docs/introduction) using [_Islands Architecture_](https://www.patterns.dev/vanilla/islands-architecture/). This presentation layer follows a pure _Model View Controller_ pattern.

- The database and domain logic defines the _model_.
- The Fresh UI defines the _view_.
- The service layer defines the _controller_.

## Session State

The user's session data is managed via the _Server Session State_ pattern. When session state must be persisted, it is serialized and stored in the Valkey database. To keep reads and writes on the Valkey database fast, session state size should be minimal. Sessions are described in [SESSIONS.md](./SESSIONS.md).
