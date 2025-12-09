/**
 * User Access Control Service
 *
 * Manages user authorization based on allow/deny lists and access mode configuration.
 * Supports three modes:
 * - strict: Only allow pubkeys on the allow list
 * - permissive: Allow all pubkeys except those on the deny list
 * - open: Allow all pubkeys
 *
 * AI-TODO: Use this service in middleware to authorize/deny incoming requests.
 */

import { NID, NIDSchema } from "@/shared/nostr/events-schema.ts";
import { getUsersConfig } from "@/features/config/config-provider.ts";
import type { UsersConfig } from "@/features/config/config-schema.ts";

/**
 * Error thrown when user access control operations fail.
 */
export class UserAccessControlError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "UserAccessControlError";
  }
}

/**
 * User access control service implementation.
 */
export class UserAccessControl {
  #config: UsersConfig;

  constructor(config: UsersConfig) {
    this.#config = config;
  }

  /**
   * Checks if a user is allowed based on the configured access mode.
   *
   * @param pubkey - The user's public key
   * @returns True if the user is allowed, false otherwise
   * @throws {UserAccessControlError} If the pubkey is invalid
   */
  isUserAllowed(pubkey: NID): boolean {
    // Validate pubkey format
    try {
      NIDSchema.parse(pubkey);
    } catch (error) {
      throw new UserAccessControlError(
        `Invalid pubkey format: ${pubkey}`,
        { cause: error },
      );
    }

    switch (this.#config.mode) {
      case "strict":
        // Only allow pubkeys on the allow list
        return this.#config.allow.includes(pubkey);

      case "permissive":
        // Allow all except those on the deny list
        return !this.#config.deny.includes(pubkey);

      case "open":
        // Allow everyone
        return true;

      default:
        // Should never happen due to Zod validation
        throw new UserAccessControlError(
          `Unknown access mode: ${this.#config.mode}`,
        );
    }
  }

  /**
   * Gets the current access mode.
   *
   * @returns The access mode ("strict", "permissive", or "open")
   */
  getAccessMode(): "strict" | "permissive" | "open" {
    return this.#config.mode;
  }

  /**
   * Gets the allow list (for strict mode).
   *
   * @returns Array of allowed pubkeys
   */
  getAllowList(): string[] {
    return [...this.#config.allow];
  }

  /**
   * Gets the deny list (for permissive mode).
   *
   * @returns Array of denied pubkeys
   */
  getDenyList(): string[] {
    return [...this.#config.deny];
  }
}

/**
 * Factory function to create a UserAccessControl instance with appropriate configuration options.
 *
 * @returns a `UserAccessControl` instance
 */
export function createUserAccessControl(): UserAccessControl {
  const usersConfig = getUsersConfig();
  return new UserAccessControl(usersConfig);
}
