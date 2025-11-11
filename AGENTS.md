# grchat

Grchat is a full-stack application for threaded chats built around Nostr identities and events.

## Overview

Grchat bundles two components:

- A Nostr relay that exclusively implements [NIP-7D](https://github.com/nostr-protocol/nips/blob/master/7D.md).
- A Nostr client for threaded discussions that exclusively works with the bundled relay.

## Technology Choices

- The application implements components of the Nostr protocol to ensure broad interoperability:
  - The server implements the [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md) protocol flow.
  - User actions are authorized via [NIP-46](https://github.com/nostr-protocol/nips/blob/master/46.md) remote signing.
  - Chat threads consist of [NIP-7D](https://github.com/nostr-protocol/nips/blob/master/7D.md) events.
- [Valkey](https://valkey.io/) provides the application database.
- The application server is built atop [Deno](https://docs.deno.com/runtime/).
- The UI is written in the [Fresh](https://fresh.deno.dev/docs/introduction) framework.
- Styling is accomplished via TailwindCSS with [DaisyUI](https://daisyui.com/docs/intro/).
- The Deno server uses [Valkey GLIDE](https://valkey.io/valkey-glide/) as its Valkey client library.
- Docker containers provide portability:
  - The Valkey database receives a dedicated Docker container.
  - The Deno server runs in a second Docker container to serve a relay WebSocket API and the Fresh UI.

## Repo Layout

The repository extends the standard Fresh layout described on its [getting started](https://fresh.deno.dev/docs/getting-started) page.

- The application entry point is [main.ts](./main.ts).
- Reusable UI components are defined in [components/](./components).
- Islands of client-side interactivity are defined in [islands/](./islands).
- Application routes are defined in [routes/](./routes).
- Static assets are found under [static/](./static).
- Docker containers for the application are defined in [containers/](./containers).
- Architecture documentation is provided in [architecture/](./architecture).
- Service layer code is defined in [services/](./services).

## Code Style

- Language:
  - The langauge of choice is TypeScript.
  - Avoid raw JavaScript.
  - Format using Deno's formatter by running `deno fmt`.
- Naming:
  - Components and islands filenames observe PascalCase conventions.
  - Routes and all other TypeScript and CSS filenames observe kebab-case conventions.
  - Markdown filenames observe UPPER_SNAKE_CASE conventions.
  - Use PascalCase names for TypeScript classes.
  - Use camelCase names for TypeScript functions and variables.
  - Use UPPER_SNAKE_CASE names for global TypeScript constants.
- Styling:
  - Prefer TailwindCSS utilities and DaisyUI components.
  - Define custom Tailwind classes in [styles.css](./assets/styles.css).
- Layout:
  - Limit line length to 100 characters. Break expressions across lines if necessary.
- Code organization:
  - Prefer shorter, single-purpose functions.
  - Prefer pure functions with no side effects.

## Development Guidelines

**Prime Directive:** _Always_ stop and ask for clarification if there is ambiguity in requirements or in implementation details.

### Special AI Comment Guidelines

Use the `AI-` comment format to communicate and clarify the intent of the code between developers and AI agents.

- Before editing code, grep the area of focus for comments beginning with `AI-`, and read them carefully to gather context.
- Developers and AI agents may provide context or clarify intent by writing comments prefixed with `AI-NOTE:`.
- Developers and AI agents may outline tasks for an AI agent to do at some point in the future by writing comments prefixed with `AI-TODO:`.
  - When encountering an `AI-TODO:` comment, consider whether the TODO can reasonably be completed as part of the current task. If it can, complete the TODO.
- AI agents may ask clarifying questions or document uncertainty by writing comments prefixed with `AI-QUESTION:`.
  - When encountering `AI-QUESTION:` comments relevant to the current task, stop and ask the developer for clarification to resolve any ambiguity posed by the questions.

### General Development Guidelines

- Always consult the [architecture documentation](./architecture) before writing code to identify project requirements.
- **Architecture documentation is privileged** and should _never_ be modified by an AI.
- Before writing any code, _always_ write an implementation plan using Markdown formatting and place it in the [plans/](./plans) directory/
- Before interacting with code written in a language other than TypeScript or JavaScript, consult the project's [FFI](./architecture/FFI.md) documentation.
- When it is necessary to write a summary of development work, or to write notes on a particular implementation, place these notes and summaries in Markdown files in an appropriate subdirectory under [notes/](./notes/).
