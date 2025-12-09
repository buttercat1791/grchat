/**
 * Configuration provider for grchat application.
 *
 * For security reasons, these functions may ONLY run on the server, never on the client.
 *
 * CODE IN THIS FILE IS SECURITY-CRITICAL. Carefully audit all changes to ensure that sensitive
 * data is not leaked to the client.
 *
 * ## Usage Pattern
 *
 * 1. Call `initializeConfig()` once at application startup (in main.ts)
 * 2. Access configuration synchronously throughout the application using getter functions
 * 3. Configuration is cached and never reloaded after initialization
 *
 * All configuration access after initialization is synchronous and will throw if
 * configuration has not been initialized.
 */

import { parse } from "@std/yaml";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { LruCache } from "@std/cache";
import { GrchatConfig, GrchatConfigSchema } from "./config-schema.ts";

const configCache = new LruCache<string, GrchatConfig>(1);
const CONFIG_CACHE_KEY = "grchat_config";

/**
 * Environment variable mapping for configuration overrides.
 * Format: GRCHAT_SECTION_SUBSECTION_KEY
 */
const PREFIX = "GRCHAT";

/**
 * Applies environment variable overrides to configuration object.
 * This mutates the config object in place before Zod validation.
 */
function applyEnvOverrides(config: Record<string, unknown>): void {
  const configObj = config as {
    app?: { name?: string; base_url?: string; port?: number };
    database?: { valkey?: { host?: string; port?: number } };
    ffi?: { noscrypt?: { bin_path?: string } };
  };

  // App configuration
  const appName = Deno.env.get(`${PREFIX}_APP_NAME`);
  if (appName) {
    configObj.app = configObj.app ?? {};
    configObj.app.name = appName;
  }

  const appBaseUrl = Deno.env.get(`${PREFIX}_APP_BASE_URL`);
  if (appBaseUrl) {
    configObj.app = configObj.app ?? {};
    configObj.app.base_url = appBaseUrl;
  }

  const appPort = Deno.env.get(`${PREFIX}_APP_PORT`);
  if (appPort) {
    configObj.app = configObj.app ?? {};
    configObj.app.port = parseInt(appPort, 10);
  }

  // Database configuration
  const valkeyHost = Deno.env.get(`${PREFIX}_DATABASE_VALKEY_HOST`);
  if (valkeyHost) {
    configObj.database = configObj.database ?? {};
    configObj.database.valkey = configObj.database.valkey ?? {};
    configObj.database.valkey.host = valkeyHost;
  }

  const valkeyPort = Deno.env.get(`${PREFIX}_DATABASE_VALKEY_PORT`);
  if (valkeyPort) {
    configObj.database = configObj.database ?? {};
    configObj.database.valkey = configObj.database.valkey ?? {};
    configObj.database.valkey.port = parseInt(valkeyPort, 10);
  }

  // FFI configuration
  const noscryptPath = Deno.env.get(`${PREFIX}_FFI_NOSCRYPT_BIN_PATH`);
  if (noscryptPath) {
    configObj.ffi = configObj.ffi ?? {};
    configObj.ffi.noscrypt = configObj.ffi.noscrypt ?? {};
    configObj.ffi.noscrypt.bin_path = noscryptPath;
  }
}

/**
 * Initializes the configuration system by loading and caching the configuration file.
 * This function MUST be called once at application startup to allow config access.
 *
 * @param configPath - Path to configuration file (defaults to grchat.yaml)
 * @returns Validated configuration object
 * @throws Error if configuration is invalid or file cannot be read
 */
export async function initializeConfig(
  configPath: string = "grchat.yaml",
): Promise<GrchatConfig> {
  try {
    // Load and parse YAML file
    const configFilePath = resolve(configPath);
    const configContent = await readFile(configFilePath, "utf-8");
    const rawConfig = parse(configContent);

    // Ensure we have an object to work with
    if (typeof rawConfig !== "object" || rawConfig === null) {
      throw new Error("Configuration file must contain a YAML object");
    }

    // Apply environment variable overrides before validation
    applyEnvOverrides(rawConfig as Record<string, unknown>);

    // Validate with Zod schema (includes all custom validation rules)
    const cfg = GrchatConfigSchema.parse(rawConfig);

    // Cache the validated configuration
    configCache.set(CONFIG_CACHE_KEY, cfg);

    return cfg;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to load configuration: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Gets the full configuration object from cache.
 * @throws Error if configuration has not been initialized
 */
export function getConfig(): GrchatConfig {
  const config = configCache.get(CONFIG_CACHE_KEY);
  if (!config) {
    throw new Error(
      "Configuration not initialized. Call initializeConfig() at application startup.",
    );
  }
  return config;
}

/**
 * Gets application configuration section.
 * @throws Error if configuration has not been initialized
 */
export function getAppConfig(): GrchatConfig["app"] {
  return getConfig().app;
}

/**
 * Gets authentication configuration section.
 * @throws Error if configuration has not been initialized
 */
export function getAuthConfig(): GrchatConfig["auth"] {
  return getConfig().auth;
}

/**
 * Gets database configuration section.
 * @throws Error if configuration has not been initialized
 */
export function getDatabaseConfig(): GrchatConfig["database"] {
  return getConfig().database;
}

/**
 * Gets FFI configuration section.
 * @throws Error if configuration has not been initialized
 */
export function getFfiConfig(): GrchatConfig["ffi"] {
  return getConfig().ffi;
}

/**
 * Gets shared services configuration section.
 * @throws Error if configuration has not been initialized
 */
export function getSharedConfig(): GrchatConfig["shared"] {
  return getConfig().shared;
}

/**
 * Gets user access control configuration section.
 * @throws Error if configuration has not been initialized
 */
export function getUsersConfig(): GrchatConfig["users"] {
  return getConfig().users;
}
