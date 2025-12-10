# Config Feature

Provides centralized configuration management for the grchat application.

## Overview

The config feature is responsible for:

- Loading configuration from `grchat.yaml`
- Applying environment variable overrides
- Validating configuration with Zod schemas
- Caching configuration for synchronous access throughout the application

## Security

**CODE IN THIS FEATURE IS SECURITY-CRITICAL.** The configuration provider runs
exclusively on the server and must never leak sensitive data to the client.

## Structure

- `services/config-provider.ts` - Configuration loading, caching, and access
  functions
- `schemas/config-schema.ts` - Zod schemas for configuration validation
- `index.ts` - Feature entry point (no routes, service-only)

## Usage Pattern

1. Call `initializeConfig()` once at application startup (in main.ts)
2. Access configuration synchronously throughout the application using getter
   functions
3. Configuration is cached and never reloaded after initialization

## Environment Variable Overrides

Configuration values can be overridden using environment variables with the
format: `GRCHAT_SECTION_SUBSECTION_KEY`

Examples:

- `GRCHAT_APP_NAME` - Override app name
- `GRCHAT_DATABASE_BACKEND` - Override database backend
- `GRCHAT_DATABASE_VALKEY_HOST` - Override Valkey host
