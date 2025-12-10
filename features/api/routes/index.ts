/**
 * API index endpoint - provides discoverable links to available API actions.
 *
 * Response (200 OK):
 * {
 *   message: string;
 *   _links: {
 *     self: { href: string, title: string },
 *     auth: {
 *       nostrconnect: { href: string, title: string },
 *       bunker: { href: string, title: string },
 *       logout: { href: string, title: string }
 *     }
 *   }
 * }
 */

import type { Context } from "fresh";
import type { State } from "@/utils.ts";

export function apiIndexHandler(_ctx: Context<State>): Response {
  const response = {
    message: "Grchat API - Available resource endpoints",
    _links: {
      self: {
        href: "/api",
        title: "API index",
      },
      auth: {
        nostrconnect: {
          href: "/api/auth/nostrconnect",
          title: "Begin client-initiated connection handshake",
        },
        bunker: {
          href: "/api/auth/bunker",
          title: "Submit bunker URL for signer-initiated authentication",
        },
        logout: {
          href: "/api/auth/logout",
          title: "End user session",
        },
      },
    },
  };

  return new Response(
    JSON.stringify(response),
    {
      status: 200,
      headers: {
        "Content-Type": "application/hal+json",
      },
    },
  );
}
