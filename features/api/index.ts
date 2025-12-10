/**
 * API feature entry point.
 *
 * Provides the API discovery endpoint at `GET /api`.
 */

import type { App } from "fresh";
import type { State } from "@/utils.ts";
import { apiIndexHandler } from "./routes/index.ts";

export function registerApiRoutes(app: App<State>): void {
  app.get("/api", apiIndexHandler);
}
