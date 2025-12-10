import { App, staticFiles } from "fresh";
import { AppServices } from "@/shared/app-services.ts";
import { initializeConfig } from "@/features/config/index.ts";
import type { State } from "./utils.ts";

// Import middleware
import { accessControlMiddlewareHandler } from "@/features/auth/index.ts";

// Import layout
import { AppLayout } from "@/shared/layout/App.tsx";

// Import route registrations
import { registerAuthRoutes } from "@/features/auth/index.ts";
import { registerApiRoutes } from "@/features/api/index.ts";

// Initialize configuration and services
const config = await initializeConfig();
await AppServices.instance.initialize({
  database: config.database,
  relayPoolConfig: {
    connectionTimeout: config.shared.nostr.relay_pool.connection_timeout,
    idleTimeout: config.shared.nostr.relay_pool.idle_timeout,
  },
  onSessionFailed: (_userPubkey, _reason) => {
    // AI-NOTE: In production, consider notifying user via WebSocket
  },
});

export const app = new App<State>()
  // Static file serving
  .use(staticFiles())
  // Global middleware
  .use(accessControlMiddlewareHandler)
  // Root layout
  .layout("*", AppLayout);

// Register feature routes
registerApiRoutes(app);
registerAuthRoutes(app);

// Graceful shutdown handlers
Deno.addSignalListener("SIGINT", () => {
  AppServices.instance.shutdown();
  Deno.exit(0);
});

Deno.addSignalListener("SIGTERM", () => {
  AppServices.instance.shutdown();
  Deno.exit(0);
});

// TODO: Install noscrypt for local testing
// TODO: Update AGENTS.md files and PATTERNS.md
