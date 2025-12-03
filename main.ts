import { App, staticFiles } from "fresh";
import { AppServices } from "./services/app-services.ts";

export const app = new App();

app.use(staticFiles());

// Include file-system based routes here
app.fsRoutes();

// TODO: Read application config from YAML and pass config values to services as relevant.

// Initialize application services on startup
await AppServices.instance.initialize({
  valkeyHost: Deno.env.get("VALKEY_HOST") ?? "localhost",
  valkeyPort: parseInt(Deno.env.get("VALKEY_PORT") ?? "6379", 10),
  relayPoolConfig: {
    connectionTimeout: 10000,
    idleTimeout: 300000,
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
