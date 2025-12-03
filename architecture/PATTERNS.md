# Architecture Patterns

An overview of the software architecture patterns used by Grchat. Pattern names and definitions are largely derived from those described in Martin Fowler's _Patterns of Enterprise Application Architecture_.

## Domain Logic

Grchat's domain logic uses the _Active Record_ pattern.

- The application data consists entirely of Nostr events.
- The application domain can be modeled as JSON objects that comply with the [NIP-7D](https://github.com/nostr-protocol/nips/blob/master/7D.md) standard.
- The entire application stack uses Nostr events consistently throughout, from the presentation layer through to the database.
- There is no need for _Data Transfer Objects_ and _Data Mappers_.
- Nostr event schemas are defined and validated via [Zod 4](https://zod.dev/).

## Service Layer

Interactions between the presentation and the domain logic are mediated by a _Service Layer_

- The service layer consists of TypeScript modules defined in the [services/](./services) directory.
- The Fresh UI presentation layer and the Nostr relay API surface both engage with domain logic via the shared service layer.
- In the MVC pattern described below, some services may act as _controllers_, but not all services are controllers. The service layer provides a broader set of business logic operations beyond just request handling.

## Web Presentation

The web presentation layer is built using [Fresh](https://fresh.deno.dev/docs/introduction) using [_Islands Architecture_](https://www.patterns.dev/vanilla/islands-architecture/). This presentation layer follows a pure _Model View Controller_ pattern.

- The database and domain logic defines the _model_.
- The Fresh UI defines the _view_.
- The service layer defines the _controller_.

Fresh's Islands Architecture enables selective hydration of interactive components:

- Server-rendered pages form the static foundation
- Interactive "islands" (Fresh components with client-side JavaScript) are hydrated on demand
- Most content is served as static HTML for performance
- Only components requiring interactivity (e.g., message input, real-time updates) run client-side JavaScript

## Nostr Relay API

Grchat exposes a WebSocket API surface that implements [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md) message protocols. This makes the grchat server a Nostr relay backed by the Valkey database.

- The grchat relay API implements NIP-01 (basic protocol) and NIP-7D (chat messages).
- The relay **must reject** any events that are not kind 11 (chat messages) or kind 1111 (threaded responses).
- NIP-7D is the only supported NIP.
- Grchat **does not use** external relays by default.
- All message data is stored exclusively in the local Valkey instance.

## Client Backend Application

Grchat's client presentation layer is driven by server state. Interactive components update session state, retrieve data, and update the UI presentation by sending HTTP requests back to the server.

- API route handlers are defined under the [`routes/api/`](./routes/api/) directory.
- API paths are defined by the file structure under the [`routes/`](./routes) directory.
- The API adheres strongly to REST level 3 as defined by the Richardson Maturity Model:
  - Routes are resource-oriented, and each resource has a unique URI.
  - HTTP verbs are used to denote actions on each resource.
  - Hypermedia links and follow-on actions are given in responses to create a self-documenting API.
- HATEOAS links adhere to the [Hypertext Application Language (HAL)](https://stateless.group/hal_specification.html) draft specification.

## Session State

The user's session data is managed via the _Server Session State_ pattern. Session state is serialized in CSV format and persisted to the Valkey database as strings. To keep reads and writes on the Valkey database fast, session state size should be minimal. Sessions are described in [SESSIONS.md](./SESSIONS.md).

## Error Handling

Errors bubble up from the service layer to the presentation layer:

- Service layer functions may throw exceptions or return error states
- Presentation layer catches errors and displays user-friendly messages
- Database errors propagate through the service layer without suppression
- FFI errors are converted to application errors at the service boundary

The presentation layer is responsible for:

- Catching and handling all errors before they reach the user
- Displaying appropriate error messages to the user
- Logging errors for debugging purposes
- Graceful degradation when non-critical operations fail

## Data Validation

Input validation occurs in the service layer:

- All user input is validated before processing
- Invalid input results in rejected operations with descriptive error messages
- Validation rules enforce Nostr event structure compliance (NIP-01, NIP-7D)
- The service layer is the single source of truth for validation logic
- Presentation layer may perform client-side validation for UX, but service layer validation is authoritative

## Schema Validation

[Zod 4](https://zod.dev/) is the preferred tool for defining and validating data schemas. Zod schemas should be used to define and validate data at grchat's application boundaries, including:

- Database active records
- Nostr message contracts
- Interfaces between components and modules

Zod schemas and codecs are defined in [schemas/](./schemas/).

## Serialization and Deserialization

- Serialization and deserialization of Zod schemas should be handled via custom codecs defined in [schemas/codecs.ts](./schemas/codecs.ts).
- Refer to Zod 4 [codecs documentation](https://zod.dev/codecs) for further information on how to define codecs.
