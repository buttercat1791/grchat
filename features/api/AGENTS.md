# API Feature

Provides the API discovery endpoint at `GET /api`.

## Overview

The API feature implements REST Level 3 (HATEOAS) by providing a discoverable
entry point that lists all available API endpoints with their relationships and
capabilities.

## Structure

- `routes/index.ts` - API discovery endpoint handler
- `index.ts` - Feature entry point with route registration

## Routes

- `GET /api` - Returns HAL+JSON response with links to available API endpoints

## Response Format

The API discovery endpoint returns a HAL+JSON response following the
[Hypertext Application Language](https://datatracker.ietf.org/doc/html/draft-kelly-json-hal)
specification, enabling clients to navigate the API dynamically without
hardcoded endpoint knowledge.
