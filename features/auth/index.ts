/**
 * Authentication feature entry point.
 *
 * Registers all authentication-related routes and exports services for external use.
 */

import type { App } from "fresh";
import type { State } from "@/utils.ts";

// Import route handlers
import { nostrconnectHandler } from "./routes/api/nostrconnect.ts";
import { bunkerHandler } from "./routes/api/bunker.ts";
import { finalizeHandler } from "./routes/api/finalize.ts";
import { logoutHandler } from "./routes/api/logout.ts";
import { handshakeHandler } from "./routes/api/handshake.ts";
import { sessionHandler } from "./routes/api/session.ts";
import { loginHandler } from "./routes/login.tsx";
import { accessDeniedHandler } from "./routes/access-denied.tsx";

export function registerAuthRoutes(app: App<State>): void {
  // Pages
  app.get("/login", loginHandler);
  app.get("/access-denied", accessDeniedHandler);

  // API routes
  app.post("/api/auth/nostrconnect", nostrconnectHandler);
  app.post("/api/auth/bunker", bunkerHandler);
  app.post("/api/auth/finalize", finalizeHandler);
  app.post("/api/auth/logout", logoutHandler);
  app.get("/api/auth/handshake/:connectionId", handshakeHandler);
  app.get("/api/auth/session/:pubkey", sessionHandler);
}

// Re-export services for external use
export { createNip46Service } from "./services/nip46-auth-service.ts";
export { createSessionManager } from "./services/session-manager-service.ts";
export { createKeepaliveService } from "./services/keepalive-service.ts";
export { accessControlMiddlewareHandler } from "./access-control-middleware.ts";
export {
  clearAuthCookie,
  getAuthCookie,
  setAuthCookie,
} from "./auth-cookie.ts";
