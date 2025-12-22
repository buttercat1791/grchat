# grchat

Grchat is a full-stack application for threaded chats built around Nostr
identities and events.

## Development Guidelines

**Prime Directive:** _Always_ stop and ask for clarification to resolve
ambiguity.

### Special AI Comment Guidelines

**Always use the `AI-` comment format to communicate intent between developers
and AI agents.**

- Before editing code, grep the focus area for comments beginning with `AI-`,
  and read them carefully to gather context.
- Provide context or clarify intent by writing comments prefixed with
  `AI-NOTE:`.
- Outline tasks to be done at some future time by writing comments prefixed with
  `AI-TODO:`.
  - Consider whether preexisting `AI-TODO:` tasks can be completed as part of
    the current effort. If so, complete the TODO.
- Ask clarifying questions or document uncertainty by writing comments prefixed
  with `AI-QUESTION:`.
  - When encountering `AI-QUESTION:` comments relevant to the current task, stop
    and ask the developer for clarification on the point raised by the question.

### General Development Guidelines

- Always consult the [architecture documentation](./architecture) before writing
  code.
- **Architecture documentation is privileged** and should _never_ be modified by
  an AI.
- Always use context7 to support tasks involving code generation, setup, or
  configuration; or to access library/API documentation. Automatically use the
  Context7 MCP tools to resolve library id and get library docs without
  explicitly being prompted to do so.
- Always use Zod 4 to define and validate interfaces between classes, modules,
  and components within the project, and with external APIs.
- Always use Fresh
  [file routing](https://fresh.deno.dev/docs/concepts/file-routing) when writing
  new UI routes and components.
- Avoid import path patterns beginning with `../`. Instead use `@/` and the
  route from the project root.
- Prefer UUIDv7 for unique identifiers. UUIDv7 identifiers are sortable by time
  of generation. Use the `@std/uuid/unstable-v7` library from JSR.
- Always verify code with `deno check`.
- Always use REST Level 3 (with HATEOAS) when defining API responses (see
  [PATTERNS](./architecture/PATTERNS.md)).

### Code Style

- Language:
  - Always use TypeScript.
  - Avoid raw JavaScript.
  - Format using Deno's formatter by running `deno fmt`.
- Naming:
  - Use PascalCase for component and island files.
  - Use kebab-case for all other `.ts` and `.css` files.
  - Use UPPER_SNAKE_CASE for `.md` files.
  - Use PascalCase names for TypeScript classes.
  - Use camelCase names for TypeScript functions and variables.
  - Use UPPER_SNAKE_CASE names for global TypeScript constants.
  - Use ES2022 `#`-prefixed names for private fields and members in TypeScript
    classes.
- Styling:
  - Always use TailwindCSS utilities and DaisyUI components.
  - Define any custom Tailwind classes in [styles.css](./assets/styles.css).
- Layout:
  - Limit line length to 100 characters. Break expressions across lines if
    necessary.
- Code organization:
  - Prefer shorter, single-purpose functions.
  - Prefer pure functions with no side effects.

### Unit Testing Guidelines

- **Avoid writing unit tests unless explicitly instructed by a developer.**
- **Avoid running unit tests.** Instead, ask the developer to run tests in
  Docker.
- Use _Behavior-Driven Development (BDD)_ methodologies.
  - **Use test suites to describe application behavior**, not implementation
    details.
  - **Write and run tests against interfaces**, not internal implementations.
  - **Only mock external dependencies**; instantiate and run all components of
    the system under test.
- Organize tests using Deno's
  [BDD facilities](https://docs.deno.com/runtime/fundamentals/testing/#behavior-driven-development).

## Project Context

Grchat bundles two components:

- A Nostr relay that exclusively implements
  [NIP-7D](https://github.com/nostr-protocol/nips/blob/master/7D.md).
- A Nostr client for threaded discussions that exclusively works with the
  bundled relay.

### Technology Stack

- The application implements components of the Nostr protocol to ensure broad
  interoperability:
  - The server implements the
    [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md) protocol
    flow.
  - User actions are authorized via
    [NIP-46](https://github.com/nostr-protocol/nips/blob/master/46.md) remote
    signing.
  - Chat threads consist of
    [NIP-7D](https://github.com/nostr-protocol/nips/blob/master/7D.md) events.
- [Valkey](https://valkey.io/) provides the application database.
  - [iovalkey](https://github.com/valkey-io/iovalkey) (a fork of ioredis) is the
    Valkey client library.
- The application server is built atop [Deno](https://docs.deno.com/runtime/).
- The UI is built on [Fresh](https://fresh.deno.dev/docs/introduction).
  - UI styling uses TailwindCSS with [DaisyUI](https://daisyui.com/llms.txt)
    components and themes.
- Docker containers provide portability:
  - The Valkey database receives a dedicated Docker container.
  - Valkey data is persisted via shared volumes.
  - The Deno server runs in a second Docker container.
  - Containers are orchestrated via Docker Compose.

### Repo Layout

The repository extends the standard Fresh layout described on its
[getting started](https://fresh.deno.dev/docs/getting-started) page, with a few
extensions:

- Architecture documentation is provided in [architecture/](./architecture).
- Docker containers for the application are defined in
  [containers/](./containers).
- Vertical-slice feature implementations are defined in [features/](./features).
- Plan and summary Markdown documents are placed in [plans/](./plans).
- Shared code utilities and services are defined in [shared/](./shared).
