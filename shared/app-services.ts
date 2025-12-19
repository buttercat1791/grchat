/**
 * Application Services Initialization Module
 *
 * Provides centralized initialization and lifecycle management for shared singleton services.
 */

import { z } from "zod";
import { type DatabaseService } from "@/shared/database/database-service.ts";
import { createDatabaseService } from "@/shared/database/database-factory.ts";
import { DatabaseServiceConfig } from "@/shared/database/database-factory.ts";
import {
  buildRelayPool,
  RelayPool,
  RelayPoolConfigSchema,
} from "@/shared/nostr/relay-pool.ts";
import {
  createNip46Service,
  Nip46Service,
} from "@/features/auth/services/nip46-auth-service.ts";
import {
  createSessionManager,
  SessionManager,
} from "@/features/auth/services/session-manager-service.ts";
import {
  createKeepaliveService,
  KeepaliveService,
} from "@/features/auth/services/keepalive-service.ts";
import {
  createHandshakeService,
  HandshakeService,
} from "@/features/auth/services/handshake-service.ts";

/**
 * Zod schema for application services configuration.
 */
export const AppServicesConfigSchema = z.object({
  database: z.custom<DatabaseServiceConfig>().optional(),
  relayPoolConfig: RelayPoolConfigSchema.optional(),
  onSessionFailed: z
    .function({
      input: [z.string(), z.string()],
      output: z.void(),
    })
    .optional(),
});
export type AppServicesConfig = z.infer<typeof AppServicesConfigSchema>;

/**
 * Singleton container for all application services
 */
export class AppServices {
  static #instance: AppServices | null = null;
  #initialized = false;

  // Service instances
  #databaseServiceInstance: DatabaseService | null = null;
  #relayPoolInstance: RelayPool | null = null;
  #nip46ServiceInstance: Nip46Service | null = null;
  #sessionManagerInstance: SessionManager | null = null;
  #keepaliveServiceInstance: KeepaliveService | null = null;
  #handshakeServiceInstance: HandshakeService | null = null;

  private constructor() {}

  /**
   * Get singleton instance
   */
  static get instance(): AppServices {
    if (!AppServices.#instance) {
      AppServices.#instance = new AppServices();
    }
    return AppServices.#instance;
  }

  /**
   * Initialize all application services
   */
  async initialize(config: AppServicesConfig = {}): Promise<void> {
    // Precondition: validate configuration
    const cfg = AppServicesConfigSchema.parse(config);

    if (this.#initialized) {
      throw new Error("Services already initialized");
    }

    // Initialize Database service
    if (!cfg.database) {
      throw new Error(
        "Database configuration is required. Provide cfg.database with database type selection.",
      );
    }
    this.#databaseServiceInstance = createDatabaseService(cfg.database);
    await this.#databaseServiceInstance.connect();

    // Initialize Relay Pool
    this.#relayPoolInstance = buildRelayPool(
      cfg.relayPoolConfig ?? {
        connectionTimeout: 10000,
        idleTimeout: 300000,
      },
    );

    // Initialize NIP-46 service
    this.#nip46ServiceInstance = createNip46Service(this.#relayPoolInstance);

    // Initialize Session Manager
    this.#sessionManagerInstance = createSessionManager(
      this.#databaseServiceInstance,
    );

    // Initialize Keepalive service
    this.#keepaliveServiceInstance = createKeepaliveService(
      this.#nip46ServiceInstance,
      this.#sessionManagerInstance,
      {
        onSessionFailed: cfg.onSessionFailed ?? ((userPubkey, reason) => {
          console.warn(
            `[AppServices] Session failed for ${userPubkey}: ${reason}`,
          );
        }),
      },
    );
    await this.#keepaliveServiceInstance.start();

    // Initialize Handshake service
    this.#handshakeServiceInstance = createHandshakeService(
      this.#nip46ServiceInstance,
      this.#relayPoolInstance,
    );

    this.#initialized = true;
  }

  /**
   * Shutdown all services
   */
  shutdown(): void {
    if (!this.#initialized) {
      return;
    }

    // Stop keepalive service
    if (this.#keepaliveServiceInstance) {
      this.#keepaliveServiceInstance.stop();
      this.#keepaliveServiceInstance = null;
    }

    // Clean up handshake service
    if (this.#handshakeServiceInstance) {
      this.#handshakeServiceInstance = null;
    }

    // Close relay pool
    if (this.#relayPoolInstance) {
      this.#relayPoolInstance.close();
      this.#relayPoolInstance = null;
    }

    // Disconnect Database service
    if (this.#databaseServiceInstance) {
      this.#databaseServiceInstance.disconnect();
      this.#databaseServiceInstance = null;
    }

    this.#nip46ServiceInstance = null;
    this.#sessionManagerInstance = null;
    this.#initialized = false;
  }

  /**
   * Get DatabaseService instance
   */
  get databaseService(): DatabaseService {
    if (!this.#databaseServiceInstance) {
      throw new Error("Services not initialized. Call initialize() first.");
    }
    return this.#databaseServiceInstance;
  }

  /**
   * Get RelayPool instance
   */
  get relayPool(): RelayPool {
    if (!this.#relayPoolInstance) {
      throw new Error("Services not initialized. Call initialize() first.");
    }
    return this.#relayPoolInstance;
  }

  /**
   * Get Nip46Service instance
   */
  get nip46Service(): Nip46Service {
    if (!this.#nip46ServiceInstance) {
      throw new Error("Services not initialized. Call initialize() first.");
    }
    return this.#nip46ServiceInstance;
  }

  /**
   * Get SessionManager instance
   */
  get sessionManager(): SessionManager {
    if (!this.#sessionManagerInstance) {
      throw new Error("Services not initialized. Call initialize() first.");
    }
    return this.#sessionManagerInstance;
  }

  /**
   * Get KeepaliveService instance
   */
  get keepaliveService(): KeepaliveService {
    if (!this.#keepaliveServiceInstance) {
      throw new Error("Services not initialized. Call initialize() first.");
    }
    return this.#keepaliveServiceInstance;
  }

  /**
   * Get HandshakeService instance
   */
  get handshakeService(): HandshakeService {
    if (!this.#handshakeServiceInstance) {
      throw new Error("Services not initialized. Call initialize() first.");
    }
    return this.#handshakeServiceInstance;
  }

  /**
   * Check if services are initialized
   */
  isInitialized(): boolean {
    return this.#initialized;
  }
}
