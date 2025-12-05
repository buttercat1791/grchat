# Architecture Patterns

An overview of the software architecture patterns used by Grchat. Pattern names
and definitions are largely derived from those described in Martin Fowler's
_Patterns of Enterprise Application Architecture_.

## Domain Logic

Grchat's domain logic uses the _Active Record_ pattern.

- The application domain can be modeled as Nostr events (JSON) that comply with
  the [NIP-7D](https://github.com/nostr-protocol/nips/blob/master/7D.md)
  standard.
- The application uses Nostr events consistently across layers, so there is no
  need for _Data Transfer Objects_ and _Data Mappers_.

## Web Presentation

The presentation layer uses
[_Islands Architecture_](https://www.patterns.dev/vanilla/islands-architecture/).

- The _view_ for each route is served as static, pre-rendered HTML.
- A handler for each route acts as a _controller_.
- Preact components are used to provide "islands" of interactivity.
- Islands may invoke API routes as _controllers_ for dynamic _views_.

## Vertical Slice Features

Application features are organized as _vertical slices_ of functionality.

- A _slice_ may include:
  - Services
  - Schemas
  - Data validation logic
  - Data structures
  - Feature-specific data access patterns
  - Feature-specific business logic
- A slice excludes:
  - The presentation layer
  - The domain model
  - Generalized data access patterns
- Place each slice in its own directory within [features/](./features/). Avoid
  separating layers within a slice; this is unnecessary.
- Write an `AGENTS.md` file within each slice directory to provide instructions
  and context relevant to that feature.

## Nostr Relay API

Grchat exposes a WebSocket API surface that implements
[NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md) message
protocols. This makes the grchat server a Nostr relay backed by the Valkey
database.

- The grchat relay API implements NIP-01 (basic protocol) and NIP-7D (chat
  messages).
- The relay **must reject** any events that are not kind 11 (chat messages) or
  kind 1111 (threaded responses).
- NIP-7D is the only supported NIP.
- Grchat **does not use** external relays by default.
- All message data is stored exclusively in the local Valkey instance.

## Client Backend Application

Grchat's client presentation layer is driven by server state. Interactive
components update session state, retrieve data, and update the UI presentation
by sending HTTP requests back to the server.

- API route handlers are defined under the [`routes/api/`](./routes/api/)
  directory.
- API paths are defined by the file structure under the [`routes/`](./routes)
  directory.
- The API adheres strongly to REST level 3 as defined by the Richardson Maturity
  Model:
  - Routes are resource-oriented, and each resource has a unique URI.
  - HTTP verbs are used to denote actions on each resource.
  - Hypermedia links and follow-on actions are given in responses to create a
    self-documenting API.
- HATEOAS links adhere to the
  [Hypertext Application Language (HAL)](https://stateless.group/hal_specification.html)
  draft specification.

## Session State

- User session data is managed via the _Server Session State_ pattern.
- Session state is serialized in CSV format and persisted to the Valkey database
  in string form.
- Sessions are described in [SESSIONS.md](./SESSIONS.md).

## Schema Validation

[Zod 4](https://zod.dev/) is the preferred tool for defining and validating data
schemas. Zod schemas should be used to define and validate data at grchat's
application boundaries, including:

- Database active records
- Nostr message contracts
- Interfaces between components and modules

Zod schemas and codecs are defined in [schemas/](./schemas/).

## Serialization and Deserialization

- Serialization and deserialization of Zod schemas should be handled via custom
  codecs defined in [schemas/codecs.ts](./shared/codecs.ts).
- Refer to Zod 4 [codecs documentation](https://zod.dev/codecs) for further
  information on how to define codecs.
