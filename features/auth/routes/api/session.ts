/**
 * API Route: GET /api/auth/session/:pubkey
 *
 * Retrieve session details for a given Nostr public key.
 *
 * URL Parameters:
 * - pubkey: The user's Nostr public key (32-byte lowercase hex string)
 *
 * Response (200 OK):
 * {
 *   userPubkey: string;
 *   signerPubkey: string;
 *   relayUrls: string[];
 *   expiresAt: string;
 *   challengeState: "pending" | "succeeded" | "failed";
 *   challengeIssuedAt?: string;
 *   ttl: number;
 *   _links: {
 *     self: { href: string, title: string }
 *   }
 * }
 *
 * Response (404 Not Found):
 * {
 *   error: string;
 * }
 *
 * Response (error):
 * {
 *   error: string;
 * }
 */

import type { Context } from "fresh";
import type { State } from "@/utils.ts";
import { AppServices } from "@/shared/app-services.ts";

export async function sessionHandler(
  ctx: Context<State>,
): Promise<Response> {
  try {
    const { pubkey } = ctx.params;

    // Validate pubkey parameter
    if (!pubkey || typeof pubkey !== "string") {
      return Response.json(
        {
          error: "pubkey parameter is required and must be a string",
        },
        { status: 400 },
      );
    }

    const services = AppServices.instance;
    const sessionManager = services.sessionManager;

    // Retrieve session
    let session;
    try {
      session = await sessionManager.getSession(pubkey);
    } catch (error) {
      return Response.json(
        {
          error: error instanceof Error
            ? `Invalid pubkey format: ${error.message}`
            : "Invalid pubkey format",
        },
        { status: 400 },
      );
    }

    if (!session) {
      return Response.json(
        {
          error: "Session not found",
        },
        { status: 404 },
      );
    }

    // Get session TTL
    const ttl = await sessionManager.getSessionTTL(pubkey);

    const selfUri = `/api/auth/session/${pubkey}`;

    const response = {
      userPubkey: session.userPubkey,
      signerPubkey: session.signerPubkey,
      relayUrls: session.relayUrls,
      expiresAt: session.expiresAt,
      challengeState: session.challengeState,
      ...(session.challengeIssuedAt && {
        challengeIssuedAt: session.challengeIssuedAt,
      }),
      ttl: ttl ?? 0,
      _links: {
        self: {
          href: selfUri,
          title: "Session details",
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
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
