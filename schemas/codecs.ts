/**
 * Implementations of some useful codes based on Zod documentation.
 *
 * @see https://zod.dev/codecs#useful-codecs
 */

import z from "zod";
import { NostrEventBase, SignatureData } from "./nostr.ts";

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

// AI-TODO: Define a custom codec to serialize signature data from a Nostr event.
export const eventToSignatureData = NostrEventBase.transform((event) => [
  0,
  event.pubkey,
  event.created_at,
  event.kind,
  event.tags,
  event.content,
]);
