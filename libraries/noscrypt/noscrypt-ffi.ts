const NC_BIN_ABS_PATH = "/usr/local/lib/libnoscrypt.so";
const NC_SEC_KEY_SIZE = 0x20;
const NC_PUB_KEY_SIZE = 0x20;
const NC_SIGNATURE_SIZE = 0x40;
const NC_ENTROPY_SIZE = 0x20;

interface Keypair {
  secretKey: string;
  publicKey: string;
}

/**
 * FFI wrapper class for Vaughn Nugent's noscrypt C library.
 * See: https://www.vaughnnugent.com/resources/software/modules/noscrypt
 *
 * @example
 * ```ts
 * const noscrypt = new Noscrypt();
 * try {
 *   const publicKey = noscrypt.getPublicKey(secretKey);
 * } finally {
 *   noscrypt.close();
 * }
 * ```
 *
 * @example Using with automatic cleanup
 * ```ts
 * using noscrypt = new Noscrypt();
 * const publicKey = noscrypt.getPublicKey(secretKey);
 * // Automatically closed when going out of scope
 * ```
 */
class Noscrypt {
  private lib: Deno.DynamicLibrary<{
    NCGetContextStructSize: {
      parameters: [];
      result: "u32";
    };
    NCInitContext: {
      parameters: ["buffer", "buffer"];
      result: "i64";
    };
    NCReInitContext: {
      parameters: ["buffer", "buffer"];
      result: "i64";
    };
    NCDestroyContext: {
      parameters: ["buffer"];
      result: "i64";
    };
    NCGetPublicKey: {
      parameters: ["buffer", "buffer", "buffer"];
      result: "i64";
    };
    NCValidateSecretKey: {
      parameters: ["buffer", "buffer"];
      result: "i64";
    };
    NCSignData: {
      parameters: ["buffer", "buffer", "buffer", "buffer", "u32", "buffer"];
      result: "i64";
    };
    NCVerifyData: {
      parameters: ["buffer", "buffer", "buffer", "u32", "buffer"];
      result: "i64";
    };
  }>;
  private context: ArrayBuffer;
  private isClosed: boolean = false;

  constructor() {
    this.lib = Deno.dlopen(NC_BIN_ABS_PATH, {
      NCGetContextStructSize: {
        parameters: [],
        result: "u32",
      },
      NCInitContext: {
        parameters: [
          "buffer", // NCContext* ctx
          "buffer", // const uint8_t entropy[32]
        ],
        result: "i64",
      },
      NCReInitContext: {
        parameters: [
          "buffer", // NCContext* ctx
          "buffer", // const uint8_t entropy[32]
        ],
        result: "i64",
      },
      NCDestroyContext: {
        parameters: [
          "buffer", // NCContext* ctx
        ],
        result: "i64",
      },
      NCGetPublicKey: {
        parameters: [
          "buffer", // const NCContext* ctx
          "buffer", // const NCSecretKey* sk
          "buffer", // NCPublicKey* pk
        ],
        result: "i64",
      },
      NCValidateSecretKey: {
        parameters: [
          "buffer", // const NCContext* ctx
          "buffer", // const NCSecretKey* sk
        ],
        result: "i64",
      },
      NCSignData: {
        parameters: [
          "buffer", // const NCContext* ctx
          "buffer", // const NCSecretKey* sk
          "buffer", // const uint8_t random32[32]
          "buffer", // const uint8_t* data
          "u32", // const uint32_t dataSize
          "buffer", // uint8_t sig64[64]
        ],
        result: "i64",
      },
      NCVerifyData: {
        parameters: [
          "buffer", // const NCContext* ctx
          "buffer", // const NCPublicKey* pk
          "buffer", // const uint8_t* data
          "u32", // const uint32_t dataSize
          "buffer", // const uint8_t sig64[64]
        ],
        result: "i64",
      },
    });

    this.context = this.#initContext();
  }

  /**
   * Gets the size of the context structure required by Noscrypt.
   *
   * @returns The size of the context structure in bytes.
   */
  #getContextSize(): number {
    this.assertNotClosed();
    return this.lib.symbols.NCGetContextStructSize();
  }

  /**
   * Initializes the context memory used by the Noscrypt library.
   *
   * @returns A pointer to the initialized context memory.
   *
   * @see https://www.vaughnnugent.com/resources/software/articles/b00e913d3927dfcb75c6877a1f0d6654e14042ca#func-ncinitcontext
   */
  #initContext(): ArrayBuffer {
    this.assertNotClosed();

    const ctxSize = this.#getContextSize();
    const ctxBuf = new ArrayBuffer(ctxSize);

    const randBuf = new Uint8Array(NC_ENTROPY_SIZE);
    crypto.getRandomValues(randBuf);

    const result = this.lib.symbols.NCInitContext(ctxBuf, randBuf);

    if (result < 0) {
      throw new Error("[noscrypt] failed to init context");
    }

    return ctxBuf;
  }

  /**
   * Re-initializes existing context memory with new entropy without reallocating. Should be called
   * between cryptographic operations.
   *
   * @see https://www.vaughnnugent.com/resources/software/articles/b00e913d3927dfcb75c6877a1f0d6654e14042ca
   */
  #reInitContext(): void {
    this.assertNotClosed();

    const randBuf = new Uint8Array(NC_ENTROPY_SIZE);
    crypto.getRandomValues(randBuf);

    const result = this.lib.symbols.NCReInitContext(this.context, randBuf);

    if (result < 0) {
      throw new Error("[noscrypt] failed to re-init context");
    }
  }

  /**
   * Clears the context memory. Should be called to avoid memory leaks when context is no longer
   * needed.
   *
   * @see https://www.vaughnnugent.com/resources/software/articles/b00e913d3927dfcb75c6877a1f0d6654e14042ca
   */
  #destroyContext(): void {
    this.assertNotClosed();

    const result = this.lib.symbols.NCDestroyContext(this.context);

    if (result < 0) {
      throw new Error("[noscrypt] failed to destroy context");
    }
  }

  /**
   * Derives a public key from a secret key.
   *
   * @param secretKey - A 32-byte hex-encoded string representation of a secret key.
   * @returns The derived public key as a hex-encoded string.
   *
   * @throws {Error} If the secret key is invalid or the operation fails.
   */
  getPublicKey(secretKey: string): string {
    this.assertNotClosed();

    const pkBuf = new Uint8Array(NC_PUB_KEY_SIZE);
    const skBuf = hexToUint8Array(secretKey);

    if (skBuf.length !== NC_SEC_KEY_SIZE) {
      throw new Error("Secret key must be a 32-bit hex encoded string.");
    }

    const result = this.lib.symbols.NCGetPublicKey(
      this.context,
      skBuf,
      pkBuf,
    );

    if (result < 0) {
      throw new Error("[noscrypt] failed to decode public key");
    }

    return uint8ArrayToHex(pkBuf);
  }

  /**
   * Validates a given secret key according to the secp256k1 curve.
   *
   * @param secretKey - A 32-byte hex-encoded string representation of the secret key to validate.
   * @returns `true` if the secret key is valid, `false` otherwise.
   *
   * @throws {Error} If the secret key format is invalid.
   *
   * @see https://www.vaughnnugent.com/resources/software/articles/b00e913d3927dfcb75c6877a1f0d6654e14042ca
   */
  validateSecretKey(secretKey: string): boolean {
    this.assertNotClosed();

    const skBuf = hexToUint8Array(secretKey);

    if (skBuf.length !== NC_SEC_KEY_SIZE) {
      throw new Error("Secret key must be a 32-bit hex encoded string.");
    }

    this.#reInitContext();

    const result = this.lib.symbols.NCValidateSecretKey(this.context, skBuf);

    return result >= 0;
  }

  /**
   * Signs raw data using a given secret key.
   *
   * @param secretKey - A 32-byte hex-encoded string representation of the secret key used to
   * generate the signature.
   * @param data - The raw data to sign (as a Uint8Array or string).
   * @returns The signature as a hex-encoded string.
   *
   * @throws {Error} If the secret key is invalid or the signing operation fails.
   *
   * @see https://www.vaughnnugent.com/resources/software/articles/b00e913d3927dfcb75c6877a1f0d6654e14042ca
   */
  signData(secretKey: string, data: Uint8Array | string): string {
    this.assertNotClosed();

    const skBuf = hexToUint8Array(secretKey);

    if (skBuf.length !== NC_SEC_KEY_SIZE) {
      throw new Error("Secret key must be a 32-bit hex encoded string.");
    }

    const dataBuf = typeof data === "string"
      ? new TextEncoder().encode(data)
      : new Uint8Array(data);

    const sigBuf = new Uint8Array(NC_SIGNATURE_SIZE);
    const randBuf = new Uint8Array(NC_ENTROPY_SIZE);
    crypto.getRandomValues(randBuf);

    this.#reInitContext();

    const result = this.lib.symbols.NCSignData(
      this.context,
      skBuf,
      randBuf,
      dataBuf,
      dataBuf.length,
      sigBuf,
    );

    if (result < 0) {
      throw new Error("[noscrypt] failed to sign data");
    }

    return uint8ArrayToHex(sigBuf);
  }

  /**
   * Verifies the signature some data against a given public key.
   *
   * @param publicKey - A 32-byte hex-encoded string representation of the public key.
   * @param data - The raw signed data (as a Uint8Array or string).
   * @param signature - The 64-byte signature as a hex-encoded string.
   * @returns `true` if the signature is valid, `false` otherwise.
   *
   * @throws {Error} If the public key or signature format is invalid.
   *
   * @see https://www.vaughnnugent.com/resources/software/articles/b00e913d3927dfcb75c6877a1f0d6654e14042ca
   */
  verifyData(
    publicKey: string,
    data: Uint8Array | string,
    signature: string,
  ): boolean {
    this.assertNotClosed();

    const pkBuf = hexToUint8Array(publicKey);

    if (pkBuf.length !== NC_PUB_KEY_SIZE) {
      throw new Error("Public key must be a 32-bit hex encoded string.");
    }

    const sigBuf = hexToUint8Array(signature);

    if (sigBuf.length !== NC_SIGNATURE_SIZE) {
      throw new Error("Signature must be a 64-bit hex encoded string.");
    }

    const dataBuf = typeof data === "string"
      ? new TextEncoder().encode(data)
      : new Uint8Array(data);

    this.#reInitContext();

    const result = this.lib.symbols.NCVerifyData(
      this.context,
      pkBuf,
      dataBuf,
      dataBuf.length,
      sigBuf,
    );

    return result >= 0;
  }

  /**
   * Randomly generates a new keypair.
   *
   * @returns An object containing the hex-encoded secret key and its derived public key.
   *
   * @throws {Error} If key generation or derivation fails.
   */
  generateKeypair(): Keypair {
    this.assertNotClosed();

    // Generate random 32 bytes for secret key
    const skBuf = new Uint8Array(NC_SEC_KEY_SIZE);
    crypto.getRandomValues(skBuf);

    const secretKey = uint8ArrayToHex(skBuf);

    // Validate the generated secret key
    if (!this.validateSecretKey(secretKey)) {
      throw new Error("[noscrypt] generated invalid secret key");
    }

    // Derive the public key
    const publicKey = this.getPublicKey(secretKey);

    return { secretKey, publicKey };
  }

  /**
   * Closes the dynamic library and releases resources.
   *
   * Must be called when done using the Noscrypt instance to prevent resource leaks.
   */
  close(): void {
    if (!this.isClosed) {
      this.#destroyContext();
      this.lib.close();
      this.isClosed = true;
    }
  }

  /**
   * Ensures the library hasn't been closed before operations.
   *
   * @throws {Error} If the library has been closed.
   */
  private assertNotClosed(): void {
    if (this.isClosed) {
      throw new Error(
        "[noscrypt] Cannot perform operations on a closed Noscrypt instance",
      );
    }
  }

  /**
   * Symbol.dispose implementation for explicit resource management.
   * Allows using `using` keyword for automatic cleanup.
   */
  [Symbol.dispose](): void {
    this.close();
  }
}

/**
 * Converts a hex string to a Uint8Array.
 *
 * @param hex - Hex string to convert (may include 0x prefix).
 * @returns Uint8Array containing the decoded bytes.
 *
 * @throws {Error} If the hex string is invalid.
 */
function hexToUint8Array(hex: string): Uint8Array<ArrayBuffer> {
  // Remove any spaces or 0x prefix
  const cleanHex = hex.replace(/\s+/g, "").replace(/^0x/i, "");

  // Validate hex string
  if (cleanHex.length % 2 !== 0) {
    throw new Error("Hex string must have an even number of characters.");
  }

  if (!/^[0-9a-fA-F]*$/.test(cleanHex)) {
    throw new Error("Invalid hex string.");
  }

  // Convert to Uint8Array
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
  }

  return bytes;
}

/**
 * Converts a Uint8Array to a hex string.
 *
 * @param bytes - Uint8Array to convert.
 * @returns Lowercase hex string representation.
 */
function uint8ArrayToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export { type Keypair, Noscrypt };
