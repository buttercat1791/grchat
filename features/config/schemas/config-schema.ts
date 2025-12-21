/**
 * Configuration schema definitions for grchat.
 *
 * Defines Zod schemas for validating the grchat.config.yaml file.
 * All configuration values are strongly typed and validated on load.
 */

import { z } from "zod";
import { NIDSchema } from "@/shared/nostr/events-schema.ts";

// App configuration
const AppConfigSchema = z.object({
  name: z.string().default("grchat"),
  version: z.string().default("0.1.0-dev"),
  base_url: z.url(),
  port: z.number().int().positive().max(65535).default(1993),
});

// Auth relay configuration
const AuthRelaysConfigSchema = z.object({
  default: z.url().startsWith("wss://"),
  allow: z.array(z.url().startsWith("wss://")).min(1),
  deny: z.array(z.url().startsWith("wss://")).default([]),
}).refine(
  (data) => data.allow.includes(data.default),
  {
    message: "auth.relays.default must be included in auth.relays.allow list",
  },
);

// NIP-46 handshake configuration
const Nip46HandshakeConfigSchema = z.object({
  default_timeout: z.number().int().positive().default(30000),
});

// NIP-46 pending connection configuration
const Nip46PendingConfigSchema = z.object({
  ttl: z.number().int().positive().default(300000),
  cleanup_interval: z.number().int().positive().default(60000),
});

// Keepalive worker configuration
const KeepaliveWorkerConfigSchema = z.object({
  ping_interval: z.number().int().positive().default(60000),
  max_failures: z.number().int().positive().default(3),
  ready_timeout: z.number().int().positive().default(5000),
});

// Session manager configuration
const SessionManagerConfigSchema = z.object({
  valkey_prefix: z.string().default("session."),
  session_ttl: z.number().int().positive().default(86400000),
  challenge_ttl: z.number().int().positive().default(21600000),
});

// Auth configuration
const AuthConfigSchema = z.object({
  relays: AuthRelaysConfigSchema,
  nip46_handshake: Nip46HandshakeConfigSchema,
  nip46_pending: Nip46PendingConfigSchema,
  keepalive_worker: KeepaliveWorkerConfigSchema,
  session_manager: SessionManagerConfigSchema,
});

// Database configuration
const DatabaseConfigSchema = z.object({
  backend: z.enum(["deno-kv"]).default("deno-kv"),
  valkey: z.object({
    host: z.string().default("localhost"),
    port: z.number().int().positive().max(65535).default(6379),
  }).optional(),
  deno_kv: z.object({
    path: z.string().optional().nullable(),
  }).optional().nullable(),
});

// FFI configuration
const FfiConfigSchema = z.object({
  noscrypt: z.object({
    bin_path: z.string(),
  }),
});

// Relay pool configuration
const RelayPoolConfigSchema = z.object({
  connection_timeout: z.number().int().positive().default(10000),
  idle_timeout: z.number().int().positive().default(300000),
});

// Shared configuration
const SharedConfigSchema = z.object({
  nostr: z.object({
    relay_pool: RelayPoolConfigSchema,
  }),
});

// User access control configuration
const UsersConfigSchema = z.object({
  mode: z.enum(["strict", "permissive", "open"]).default("strict"),
  allow: z.array(NIDSchema).default([]),
  deny: z.array(NIDSchema).default([]).optional().nullable(),
}).refine(
  (data) => data.mode !== "strict" || data.allow.length > 0,
  {
    message: 'users.mode is "strict" but users.allow list is empty',
  },
);

// Root configuration schema
export const GrchatConfigSchema = z.object({
  app: AppConfigSchema,
  auth: AuthConfigSchema,
  database: DatabaseConfigSchema,
  ffi: FfiConfigSchema,
  shared: SharedConfigSchema,
  users: UsersConfigSchema,
});

// Type exports
export type GrchatConfig = z.infer<typeof GrchatConfigSchema>;
export type AppConfig = z.infer<typeof AppConfigSchema>;
export type AuthConfig = z.infer<typeof AuthConfigSchema>;
export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;
export type FfiConfig = z.infer<typeof FfiConfigSchema>;
export type SharedConfig = z.infer<typeof SharedConfigSchema>;
export type UsersConfig = z.infer<typeof UsersConfigSchema>;
export type AuthRelaysConfig = z.infer<typeof AuthRelaysConfigSchema>;
export type Nip46HandshakeConfig = z.infer<typeof Nip46HandshakeConfigSchema>;
export type Nip46PendingConfig = z.infer<typeof Nip46PendingConfigSchema>;
export type KeepaliveWorkerConfig = z.infer<typeof KeepaliveWorkerConfigSchema>;
export type SessionManagerConfig = z.infer<typeof SessionManagerConfigSchema>;
export type RelayPoolConfig = z.infer<typeof RelayPoolConfigSchema>;
