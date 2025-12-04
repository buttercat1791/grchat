/**
 * Implementations of some useful codes based on Zod documentation.
 *
 * @see https://zod.dev/codecs#useful-codecs
 */

import z from "zod";
import { NostrEventBaseSchema } from "@/shared/nostr/events-schema.ts";
import { SessionStateSchema } from "@/shared/session-schema.ts";

export const utf8ToBytes = z.codec(z.string(), z.instanceof(Uint8Array), {
  decode: (str) => new TextEncoder().encode(str),
  encode: (bytes) => new TextDecoder().decode(bytes),
});

export const bytesToUtf8 = z.codec(z.instanceof(Uint8Array), z.string(), {
  decode: (bytes) => new TextDecoder().decode(bytes),
  encode: (str) => new TextEncoder().encode(str),
});

export const hexToBytes = z.codec(z.hex(), z.instanceof(Uint8Array), {
  decode: (hexString) => z.util.hexToUint8Array(hexString),
  encode: (bytes) => z.util.uint8ArrayToHex(bytes),
});

export const eventToSignatureData = NostrEventBaseSchema.transform((event) => [
  0,
  event.pubkey,
  event.created_at,
  event.kind,
  event.tags,
  event.content,
]);

export const sessionModelToCsv = z.codec(
  SessionStateSchema,
  z.stringFormat("semicolon-csv", /^[^;]*(;[^;]*)*$/),
  {
    decode: (session) =>
      [
        session.userPubkey,
        session.signerPubkey,
        session.relayUrls.join("|"),
        session.expiresAt.toString(),
        session.challengeState,
        session.challengeIssuedAt?.toString() ?? "",
      ].join(";"),
    encode: (csv) => {
      const parts = csv.split(";");
      return SessionStateSchema.parse({
        userPubkey: parts[0],
        signerPubkey: parts[1],
        relayUrls: parts[2].split("|"),
        expiresAt: parseInt(parts[3]),
        challengeState: parts[4],
        challengeIssuedAt: parts[5] ? parseInt(parts[5]) : undefined,
      });
    },
  },
);
