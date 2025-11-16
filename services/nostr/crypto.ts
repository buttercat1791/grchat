/**
 * Cryptography Service
 *
 * Provides cryptographic operations for Nostr events, wrapping the noscrypt FFI
 * library with business logic for event signing, verification, and ID generation.
 *
 * @see https://github.com/nostr-protocol/nips/blob/master/01.md
 */

import { Noscrypt } from "@/libraries/noscrypt/noscrypt-ffi.ts";
import { NEventID, NID, NostrEvent, NostrEventBase } from "@/schemas/nostr.ts";
import {
  bytesToUtf8,
  eventToSignatureData,
  utf8ToBytes,
} from "@/schemas/codecs.ts";
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

/**
 * Computes the event ID by serializing the event and hashing the serialized data with SHA-256.
 *
 * @param event - The event for which an ID is to be generated
 * @returns The event ID as a 32-byte lowercase hex string
 *
 * @throws {CryptoError} If ID computation fails
 */
export async function computeEventId(
  event: z.infer<typeof NostrEventBase>,
): Promise<z.infer<typeof NEventID>> {
  try {
    const sigData = eventToSignatureData.decode(event);
    const json = JSON.stringify(sigData);
    const encoded = utf8ToBytes.decode(json);

    // Compute SHA-256 hash
    const hashBuf = await crypto.subtle.digest("SHA-256", encoded);
    const hashArr = new Uint8Array(hashBuf);

    // Convert to lowercase hex string
    const hex = bytesToUtf8.decode(hashArr);

    return hex;
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
  event: z.infer<typeof NostrEventBase>,
  secretKey: z.infer<typeof NID>,
): Promise<z.infer<typeof NostrEvent>> {
  try {
    // Compute the event ID
    const id = await computeEventId(event);

    // Sign the event ID with noscrypt
    using noscrypt = new Noscrypt();
    const sig = noscrypt.signData(secretKey, id);

    // Return the complete signed event
    return {
      ...event,
      id,
      sig,
    };
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
  event: z.infer<typeof NostrEvent>,
): Promise<boolean> {
  try {
    // Recompute the event ID
    const computedId = await computeEventId({
      pubkey: event.pubkey,
      created_at: event.created_at,
      kind: event.kind,
      tags: event.tags,
      content: event.content,
    });

    // Verify the ID matches
    if (computedId !== event.id) {
      return false;
    }

    // Verify the signature using noscrypt
    using noscrypt = new Noscrypt();
    return noscrypt.verifyData(event.pubkey, event.id, event.sig);
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
export function getPublicKey(secretKey: z.infer<typeof NID>): string {
  try {
    using noscrypt = new Noscrypt();
    return noscrypt.getPublicKey(secretKey);
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
export function validateSecretKey(secretKey: z.infer<typeof NID>): boolean {
  try {
    using noscrypt = new Noscrypt();
    return noscrypt.validateSecretKey(secretKey);
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
  secretKey: z.infer<typeof NID>;
  publicKey: z.infer<typeof NID>;
} {
  try {
    using noscrypt = new Noscrypt();
    return noscrypt.generateKeypair();
  } catch (error) {
    throw new CryptoError("Failed to generate keypair", { cause: error });
  }
}
