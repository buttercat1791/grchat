import { App, staticFiles } from "fresh";
import { AppServices } from "@/shared/app-services.ts";
import { initializeConfig } from "@/features/config/config-provider.ts";
import { State } from "./utils.ts";

export const app = new App<State>();

app.use(staticFiles());

// Include file-system based routes here
app.fsRoutes();

// Initialize configuration system at startup
const config = await initializeConfig();

await AppServices.instance.initialize({
  valkeyHost: config.database.valkey.host,
  valkeyPort: config.database.valkey.port,
  relayPoolConfig: {
    connectionTimeout: config.shared.nostr.relay_pool.connection_timeout,
    idleTimeout: config.shared.nostr.relay_pool.idle_timeout,
  },
  onSessionFailed: (_userPubkey, _reason) => {
    // AI-NOTE: In production, consider notifying the user via WebSocket or other mechanism
  },
});

// Handle graceful shutdown
Deno.addSignalListener("SIGINT", () => {
  AppServices.instance.shutdown();
  Deno.exit(0);
});

Deno.addSignalListener("SIGTERM", () => {
  AppServices.instance.shutdown();
  Deno.exit(0);
});
