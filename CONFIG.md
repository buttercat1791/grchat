# Configuration Guide

This document provides comprehensive documentation for configuring grchat.

## Overview

Grchat uses YAML-based configuration with environment variable overrides. All
configuration values are validated using Zod schemas at startup, ensuring type
safety and preventing misconfigurations.

## Configuration File Location

- `grchat.yaml` in the project root

## Configuration Structure

The configuration file is organized into six main sections:

1. [Application Configuration](#application-configuration)
2. [Authentication Configuration](#authentication-configuration)
3. [Database Configuration](#database-configuration)
4. [FFI Configuration](#ffi-configuration)
5. [Shared Services Configuration](#shared-services-configuration)
6. [User Access Control](#user-access-control)

---

## Application Configuration

Application-level settings including name, base URL, and server port.

```yaml
app:
  name: grchat # Application name (shown in NIP-46 handshake)
  base_url: "http://localhost:5173" # Public-facing URL (required for NIP-46)
  port: 1993 # Server port (default: 1993)
```

### Fields

| Field      | Type         | Required | Default    | Description                                                                                 |
| ---------- | ------------ | -------- | ---------- | ------------------------------------------------------------------------------------------- |
| `name`     | string       | No       | `"grchat"` | Application name displayed to users during authentication                                   |
| `base_url` | string (URL) | Yes      | -          | Public-facing URL of the application. Must be accessible by users for NIP-46 authentication |
| `port`     | number       | No       | `1993`     | Port on which the application server listens                                                |

### Environment Variable Overrides

- `GRCHAT_APP_NAME` - Override the application name
- `GRCHAT_APP_BASE_URL` - Override the base URL
- `GRCHAT_APP_PORT` - Override the server port

---

## Authentication Configuration

Authentication settings for NIP-46 remote signing, session management, and
keepalive.

### Relay Configuration

```yaml
auth:
  relays:
    default: "wss://theforest.nostr1.com"
    allow:
      - "wss://theforest.nostr1.com"
      - "wss://thecitadel.nostr1.com"
      # ... more relays
    deny:
      - "wss://nos.lol"
      - "wss://relay.damus.io"
```

| Field     | Type          | Required | Default | Description                                                       |
| --------- | ------------- | -------- | ------- | ----------------------------------------------------------------- |
| `default` | string (URL)  | Yes      | -       | Default relay for NIP-46 communication. Must be in the allow list |
| `allow`   | array of URLs | Yes      | -       | List of allowed relay URLs. Must contain at least one relay       |
| `deny`    | array of URLs | No       | `[]`    | List of denied relay URLs                                         |

**Validation Rules:**

- All relay URLs must start with `wss://`
- `default` relay must be present in the `allow` list
- At least one relay must be in the `allow` list

### NIP-46 Handshake Configuration

```yaml
auth:
  nip46_handshake:
    default_timeout: 30000 # Default timeout for NIP-46 operations (ms)
    handshake_expiration: 30000 # Maximum time to wait for handshake (ms)
    polling_interval: 500 # Handshake status check interval (ms)
```

| Field                  | Type   | Default | Description                                                        |
| ---------------------- | ------ | ------- | ------------------------------------------------------------------ |
| `default_timeout`      | number | `30000` | Default timeout for NIP-46 operations in milliseconds (30 seconds) |
| `handshake_expiration` | number | `30000` | Maximum time to wait for handshake completion (30 seconds)         |
| `polling_interval`     | number | `500`   | Interval between handshake status checks (500ms)                   |

### Pending Connection Configuration

```yaml
auth:
  nip46_pending:
    ttl: 300000 # Pending connection TTL (ms)
    cleanup_interval: 60000 # Cleanup interval (ms)
```

| Field              | Type   | Default  | Description                                                      |
| ------------------ | ------ | -------- | ---------------------------------------------------------------- |
| `ttl`              | number | `300000` | Time-to-live for pending connections in milliseconds (5 minutes) |
| `cleanup_interval` | number | `60000`  | Interval for cleaning up expired connections (1 minute)          |

### Keepalive Worker Configuration

```yaml
auth:
  keepalive_worker:
    ping_interval: 60000 # Time between keepalive pings (ms)
    max_failures: 3 # Max consecutive failures before termination
    ready_timeout: 5000 # Worker readiness wait time (ms)
```

| Field           | Type   | Default | Description                                                  |
| --------------- | ------ | ------- | ------------------------------------------------------------ |
| `ping_interval` | number | `60000` | Time between keepalive pings in milliseconds (60 seconds)    |
| `max_failures`  | number | `3`     | Maximum consecutive ping failures before session termination |
| `ready_timeout` | number | `5000`  | Timeout waiting for worker to signal readiness (5 seconds)   |

### Session Manager Configuration

```yaml
auth:
  session_manager:
    valkey_prefix: "session." # Valkey key namespace
    session_ttl: 86400000 # Session TTL (ms) - 24 hours
    challenge_ttl: 21600000 # NIP-42 challenge expiration (ms) - 6 hours
```

| Field           | Type   | Default      | Description                                     |
| --------------- | ------ | ------------ | ----------------------------------------------- |
| `valkey_prefix` | string | `"session."` | Prefix for session keys in Valkey database      |
| `session_ttl`   | number | `86400000`   | Session time-to-live in milliseconds (24 hours) |
| `challenge_ttl` | number | `21600000`   | NIP-42 challenge expiration time (6 hours)      |

---

## Database Configuration

Database connection settings for Valkey (Redis-compatible).

```yaml
database:
  valkey:
    host: "valkey" # Valkey server hostname
    port: 6379 # Valkey server port
```

| Field  | Type   | Required | Default       | Description                                 |
| ------ | ------ | -------- | ------------- | ------------------------------------------- |
| `host` | string | No       | `"localhost"` | Hostname or IP address of the Valkey server |
| `port` | number | No       | `6379`        | Port on which Valkey server is listening    |

### Environment Variable Overrides

- `GRCHAT_DATABASE_VALKEY_HOST` - Override Valkey hostname
- `GRCHAT_DATABASE_VALKEY_PORT` - Override Valkey port

---

## FFI Configuration

Foreign Function Interface configuration for native libraries.

```yaml
ffi:
  noscrypt:
    bin_path: "/usr/local/lib/libnoscrypt.so"
```

| Field      | Type   | Required | Default | Description                                       |
| ---------- | ------ | -------- | ------- | ------------------------------------------------- |
| `bin_path` | string | Yes      | -       | Absolute path to the noscrypt shared library file |

### Environment Variable Overrides

- `GRCHAT_FFI_NOSCRYPT_BIN_PATH` - Override noscrypt library path

**Note:** The noscrypt library is used for NIP-44 encryption/decryption. Ensure
the library is compiled and available at the specified path.

---

## Shared Services Configuration

Configuration for shared services used across the application.

### Relay Pool Configuration

```yaml
shared:
  nostr:
    relay_pool:
      connection_timeout: 10000 # WebSocket connection timeout (ms)
      idle_timeout: 300000 # Connection idle timeout (ms) - 5 minutes
```

| Field                | Type   | Default  | Description                                               |
| -------------------- | ------ | -------- | --------------------------------------------------------- |
| `connection_timeout` | number | `10000`  | WebSocket connection timeout in milliseconds (10 seconds) |
| `idle_timeout`       | number | `300000` | Connection idle timeout in milliseconds (5 minutes)       |

---

## User Access Control

User authorization configuration with three access modes.

```yaml
users:
  mode: "strict" # Access mode: strict|permissive|open
  allow:
    - "70122128273bdc07af9be7725fa5c4bc0fc146866bec38d44360dc4bc6cc18b9"
  deny: []
```

| Field   | Type             | Required | Default    | Description                                |
| ------- | ---------------- | -------- | ---------- | ------------------------------------------ |
| `mode`  | enum             | No       | `"strict"` | Access control mode (see below)            |
| `allow` | array of strings | No       | `[]`       | List of allowed user pubkeys (64-char hex) |
| `deny`  | array of strings | No       | `[]`       | List of denied user pubkeys (64-char hex)  |

### Access Modes

**1. Strict Mode (`"strict"`)**

- Only users whose pubkeys are in the `allow` list can connect
- Most restrictive mode
- Useful for private instances or beta testing

**2. Permissive Mode (`"permissive"`)**

- All users can connect except those in the `deny` list
- Good for public instances with selective blocking
- `deny` list is checked, `allow` list is ignored

**3. Open Mode (`"open"`)**

- All users can connect
- No access control enforcement
- Both `allow` and `deny` lists are ignored

**Validation Rules:**

- All pubkeys must be valid NIDs (64-character hexadecimal strings)
- If `mode` is `"strict"`, the `allow` list must not be empty

---

## Environment Variable Overrides

All configuration values can be overridden using environment variables following
the pattern: `GRCHAT_SECTION_SUBSECTION_KEY`

### Complete List

| Environment Variable           | Config Path             | Example                         |
| ------------------------------ | ----------------------- | ------------------------------- |
| `GRCHAT_APP_NAME`              | `app.name`              | `grchat`                        |
| `GRCHAT_APP_BASE_URL`          | `app.base_url`          | `https://grchat.example.com`    |
| `GRCHAT_APP_PORT`              | `app.port`              | `1993`                          |
| `GRCHAT_DATABASE_VALKEY_HOST`  | `database.valkey.host`  | `valkey.internal`               |
| `GRCHAT_DATABASE_VALKEY_PORT`  | `database.valkey.port`  | `6379`                          |
| `GRCHAT_FFI_NOSCRYPT_BIN_PATH` | `ffi.noscrypt.bin_path` | `/usr/local/lib/libnoscrypt.so` |

**Note:** Environment variables take precedence over YAML configuration values.
