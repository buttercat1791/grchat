/**
 * Cryptographic Operations for Nostr Events
 *
 * Provides cryptographic operations for Nostr events, wrapping the noscrypt FFI
 * library with business logic for event signing, verification, and ID generation.
 *
 * @see https://github.com/nostr-protocol/nips/blob/master/01.md
 */

import { Noscrypt } from "@/shared/ffi/noscrypt/noscrypt-ffi.ts";
import {
  type NEventId,
  NEventIDSchema,
  type NID,
  NIDSchema,
  type NostrEvent,
  type NostrEventBase,
  NostrEventBaseSchema,
  NostrEventSchema,
} from "@/shared/nostr/events-schema.ts";
import {
  eventToSignatureData,
  hexToBytes,
  utf8ToBytes,
} from "@/shared/codecs.ts";
import { z } from "zod";

/**
 * Error thrown when cryptographic operations fail.
 */
export class CryptoError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CryptoError";
  }
}

function serializeEvent(event: NostrEventBase): string {
  const data = eventToSignatureData.decode(event);
  return JSON.stringify(data);
}

/**
 * Computes the event ID by serializing the event and hashing the serialized data with SHA-256.
 *
 * @param event - The event for which an ID is to be generated, or the serialization of the event
 * data per NIP-01.
 * @returns The event ID as a 32-byte lowercase hex string
 *
 * @throws {CryptoError} If ID computation fails
 */
export async function computeEventId(
  event: NostrEventBase | string,
): Promise<NEventId> {
  const data: string = typeof event !== "string"
    ? serializeEvent(event)
    : event;

  try {
    const encoded = utf8ToBytes.decode(data);

    // Compute SHA-256 hash
    const hashBuf = await crypto.subtle.digest("SHA-256", encoded);
    const hashArr = new Uint8Array(hashBuf);

    // Convert to lowercase hex string
    const hex = hexToBytes.encode(hashArr);

    return NEventIDSchema.parse(hex);
  } catch (error) {
    throw new CryptoError("Failed to compute event ID", { cause: error });
  }
}

/**
 * Signs a Nostr event using a given secret key.
 *
 * @param event - The event to sign
 * @param secretKey - The secret key
 * @returns The signed event with id and sig fields populated
 *
 * @throws {CryptoError} If signing fails
 */
export async function signEvent(
  event: NostrEventBase,
  secretKey: NID,
): Promise<NostrEvent> {
  // Preconditions: validate arguments
  const ev = NostrEventBaseSchema.parse(event);
  const secKey = NIDSchema.parse(secretKey);
  const evData = serializeEvent(ev);

  try {
    // Compute the event ID
    const id = await computeEventId(evData);

    // Sign the event ID with noscrypt
    using noscrypt = new Noscrypt();
    const sig = noscrypt.signData(secKey, evData);

    // Return the complete signed event
    const signedEvent = NostrEventSchema.parse({
      ...ev,
      id,
      sig,
    });

    return signedEvent;
  } catch (error) {
    if (error instanceof CryptoError) {
      throw error;
    }
    throw new CryptoError("Failed to sign event", { cause: error });
  }
}

/**
 * Verifies that a Nostr event's signature is valid.
 *
 * @param event - The signed event to verify
 * @returns True if the signature is valid, false otherwise
 *
 * @throws {CryptoError} If verification process fails (not including invalid signatures)
 */
export async function verifyEventSignature(
  event: NostrEvent,
): Promise<boolean> {
  // Precondition: validate event argument
  const ev = NostrEventSchema.parse(event);
  const evData = serializeEvent(ev);

  try {
    // Recompute the event ID
    const computedId = await computeEventId(evData);

    // Verify the ID matches
    if (computedId !== ev.id) {
      return false;
    }

    // Verify the signature using noscrypt
    using noscrypt = new Noscrypt();
    return noscrypt.verifyData(
      ev.pubkey,
      evData,
      ev.sig,
    );
  } catch (error) {
    throw new CryptoError("Failed to verify event signature", {
      cause: error,
    });
  }
}

/**
 * Derives a public key from a secret key.
 *
 * @param secretKey - The secret key (32-byte hex string)
 * @returns The derived public key (32-byte hex string)
 *
 * @throws {CryptoError} If public key derivation fails
 */
export function getPublicKey(secretKey: NID): string {
  // Precondition: validate secret key argument
  const secKey = NIDSchema.parse(secretKey);

  try {
    using noscrypt = new Noscrypt();
    const publicKey = noscrypt.getPublicKey(secKey);

    return NIDSchema.parse(publicKey);
  } catch (error) {
    throw new CryptoError("Failed to derive public key", { cause: error });
  }
}

/**
 * Validates a secret key according to the secp256k1 curve.
 *
 * @param secretKey - The secret key to validate (32-byte hex string)
 * @returns True if the secret key is valid, false otherwise
 *
 * @throws {CryptoError} If validation process fails
 */
export function validateSecretKey(secretKey: NID): boolean {
  // Precondition: validate secret key argument
  const secKey = NIDSchema.parse(secretKey);

  try {
    using noscrypt = new Noscrypt();
    return noscrypt.validateSecretKey(secKey);
  } catch (error) {
    throw new CryptoError("Failed to validate secret key", { cause: error });
  }
}

/**
 * Generates a random keypair.
 *
 * @returns An object containing the secret key and derived public key
 *
 * @throws {CryptoError} If keypair generation fails
 */
export function generateKeypair(): {
  secretKey: NID;
  publicKey: NID;
} {
  try {
    using noscrypt = new Noscrypt();
    const keypair = noscrypt.generateKeypair();

    const keys = z.object({
      secretKey: NIDSchema,
      publicKey: NIDSchema,
    }).parse(keypair);

    return keys;
  } catch (error) {
    throw new CryptoError("Failed to generate keypair", { cause: error });
  }
}
