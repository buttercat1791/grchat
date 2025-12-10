/**
 * Configuration feature entry point.
 *
 * This feature manages application configuration loading and access.
 * No routes are registered as this is a service-only feature.
 */

// Config feature has no routes, only re-exports services
export {
  getAppConfig,
  getAuthConfig,
  getConfig,
  getDatabaseConfig,
  getFfiConfig,
  getSharedConfig,
  getUsersConfig,
  initializeConfig,
} from "./services/config-provider.ts";

export type {
  AppConfig,
  AuthConfig,
  AuthRelaysConfig,
  DatabaseConfig,
  FfiConfig,
  GrchatConfig,
  KeepaliveWorkerConfig,
  Nip46HandshakeConfig,
  Nip46PendingConfig,
  RelayPoolConfig,
  SessionManagerConfig,
  SharedConfig,
  UsersConfig,
} from "./schemas/config-schema.ts";
