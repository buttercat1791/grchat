import { bytesToUtf8, utf8ToBytes } from "@/schemas/codecs.ts";

const NC_BIN_ABS_PATH = "/usr/local/lib/libnoscrypt.so";
const NC_SEC_KEY_SIZE = 0x20;
const NC_PUB_KEY_SIZE = 0x20;
const NC_SIGNATURE_SIZE = 0x40;
const NC_ENTROPY_SIZE = 0x20;

// NIP-44 constants
const NC_NIP44_IV_SIZE = 0x20;
const NC_ENC_VERSION_NIP44 = 0x2c;

// NCUtilCipher flags
const NC_UTIL_CIPHER_MODE_ENCRYPT = 0x00;
const NC_UTIL_CIPHER_MODE_DECRYPT = 0x01;
const NC_UTIL_CIPHER_ZERO_ON_FREE = 0x02;

// NCEncryptionArgs property IDs
const NC_ENC_SET_IV = 0x02;

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
    // NCUtilCipher high-level encryption API
    NCUtilCipherAlloc: {
      parameters: ["u32", "u32"];
      result: "pointer";
    };
    NCUtilCipherFree: {
      parameters: ["pointer"];
      result: "void";
    };
    NCUtilCipherInit: {
      parameters: ["pointer", "buffer", "u32"];
      result: "i64";
    };
    NCUtilCipherUpdate: {
      parameters: ["pointer", "buffer", "buffer", "buffer"];
      result: "i64";
    };
    NCUtilCipherGetOutputSize: {
      parameters: ["pointer"];
      result: "i64";
    };
    NCUtilCipherReadOutput: {
      parameters: ["pointer", "buffer", "u32"];
      result: "i64";
    };
    NCUtilCipherSetProperty: {
      parameters: ["pointer", "u32", "buffer", "u32"];
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
      // NCUtilCipher high-level encryption API
      NCUtilCipherAlloc: {
        parameters: [
          "u32", // uint32_t encVersion
          "u32", // uint32_t flags
        ],
        result: "pointer",
      },
      NCUtilCipherFree: {
        parameters: [
          "pointer", // NCUtilCipherContext* encCtx
        ],
        result: "void",
      },
      NCUtilCipherInit: {
        parameters: [
          "pointer", // NCUtilCipherContext* encCtx
          "buffer", // const uint8_t* inputData
          "u32", // uint32_t inputSize
        ],
        result: "i64",
      },
      NCUtilCipherUpdate: {
        parameters: [
          "pointer", // NCUtilCipherContext* encCtx
          "buffer", // const NCContext* libContext
          "buffer", // const NCSecretKey* sk
          "buffer", // const NCPublicKey* pk
        ],
        result: "i64",
      },
      NCUtilCipherGetOutputSize: {
        parameters: [
          "pointer", // const NCUtilCipherContext* encCtx
        ],
        result: "i64",
      },
      NCUtilCipherReadOutput: {
        parameters: [
          "pointer", // const NCUtilCipherContext* encCtx
          "buffer", // uint8_t* output
          "u32", // uint32_t outputSize
        ],
        result: "i64",
      },
      NCUtilCipherSetProperty: {
        parameters: [
          "pointer", // NCUtilCipherContext* ctx
          "u32", // uint32_t property
          "buffer", // uint8_t* value
          "u32", // uint32_t valueLen
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
   * Encrypts plaintext using NIP-44 encryption.
   *
   * @param secretKey - A 32-byte hex-encoded secret key of the sender
   * @param publicKey - A 32-byte hex-encoded public key of the recipient
   * @param plaintext - The plaintext string to encrypt
   * @returns The encrypted ciphertext as a base64-encoded string (NIP-44 format)
   *
   * @throws {Error} If encryption fails
   */
  encryptNip44(
    secretKey: string,
    publicKey: string,
    plaintext: string,
  ): string {
    this.assertNotClosed();

    const skBuf = hexToUint8Array(secretKey);
    if (skBuf.length !== NC_SEC_KEY_SIZE) {
      throw new Error("Secret key must be a 32-byte hex encoded string.");
    }

    const pkBuf = hexToUint8Array(publicKey);
    if (pkBuf.length !== NC_PUB_KEY_SIZE) {
      throw new Error("Public key must be a 32-byte hex encoded string.");
    }

    // Encode plaintext to UTF-8 bytes
    const plaintextBuf = utf8ToBytes.decode(plaintext);

    // Allocate cipher context for NIP-44 encryption
    const cipherCtx = this.lib.symbols.NCUtilCipherAlloc(
      NC_ENC_VERSION_NIP44,
      NC_UTIL_CIPHER_MODE_ENCRYPT | NC_UTIL_CIPHER_ZERO_ON_FREE,
    );
    if (cipherCtx === null) {
      throw new Error("[noscrypt] failed to allocate cipher context");
    }

    try {
      // Initialize with plaintext data
      let result = this.lib.symbols.NCUtilCipherInit(
        cipherCtx,
        plaintextBuf,
        plaintextBuf.length,
      );
      if (result < 0) {
        throw new Error(`[noscrypt] failed to initialize cipher: ${result}`);
      }

      // Generate and set random nonce (required for NIP-44 encryption)
      const nonceBuf = new Uint8Array(NC_NIP44_IV_SIZE);
      crypto.getRandomValues(nonceBuf);

      result = this.lib.symbols.NCUtilCipherSetProperty(
        cipherCtx,
        NC_ENC_SET_IV,
        nonceBuf,
        NC_NIP44_IV_SIZE,
      );
      if (result < 0) {
        throw new Error(`[noscrypt] failed to set nonce: ${result}`);
      }

      this.#reInitContext();

      // Perform encryption
      result = this.lib.symbols.NCUtilCipherUpdate(
        cipherCtx,
        this.context,
        skBuf,
        pkBuf,
      );
      if (result < 0) {
        throw new Error(`[noscrypt] encryption failed: ${result}`);
      }

      // Get output size
      const outputSize = this.lib.symbols.NCUtilCipherGetOutputSize(cipherCtx);
      if (outputSize < 0) {
        throw new Error(`[noscrypt] failed to get output size: ${outputSize}`);
      }

      // Read encrypted output
      const outputBuf = new Uint8Array(Number(outputSize));
      result = this.lib.symbols.NCUtilCipherReadOutput(
        cipherCtx,
        outputBuf,
        outputBuf.length,
      );
      if (result < 0) {
        throw new Error(`[noscrypt] failed to read output: ${result}`);
      }

      // Return as base64 (use String.fromCharCode for binary data, not UTF-8 decoder)
      return btoa(String.fromCharCode(...outputBuf));
    } finally {
      // Always free the cipher context
      this.lib.symbols.NCUtilCipherFree(cipherCtx);
    }
  }

  /**
   * Decrypts NIP-44 encrypted ciphertext.
   *
   * @param secretKey - A 32-byte hex-encoded secret key of the recipient
   * @param publicKey - A 32-byte hex-encoded public key of the sender
   * @param ciphertext - The base64-encoded NIP-44 ciphertext
   * @returns The decrypted plaintext string
   *
   * @throws {Error} If decryption or MAC verification fails
   */
  decryptNip44(
    secretKey: string,
    publicKey: string,
    ciphertext: string,
  ): string {
    this.assertNotClosed();

    const skBuf = hexToUint8Array(secretKey);
    if (skBuf.length !== NC_SEC_KEY_SIZE) {
      throw new Error("Secret key must be a 32-byte hex encoded string.");
    }

    const pkBuf = hexToUint8Array(publicKey);
    if (pkBuf.length !== NC_PUB_KEY_SIZE) {
      throw new Error("Public key must be a 32-byte hex encoded string.");
    }

    // Decode base64 payload
    const payloadBuf = Uint8Array.from(
      atob(ciphertext),
      (c) => c.charCodeAt(0),
    );

    // Allocate cipher context for NIP-44 decryption
    const cipherCtx = this.lib.symbols.NCUtilCipherAlloc(
      NC_ENC_VERSION_NIP44,
      NC_UTIL_CIPHER_MODE_DECRYPT | NC_UTIL_CIPHER_ZERO_ON_FREE,
    );

    if (cipherCtx === null) {
      throw new Error("[noscrypt] failed to allocate cipher context");
    }

    try {
      // Initialize with ciphertext data (full NIP-44 payload)
      let result = this.lib.symbols.NCUtilCipherInit(
        cipherCtx,
        payloadBuf,
        payloadBuf.length,
      );
      if (result < 0) {
        throw new Error(`[noscrypt] failed to initialize cipher: ${result}`);
      }

      this.#reInitContext();

      // Perform decryption (includes MAC verification)
      result = this.lib.symbols.NCUtilCipherUpdate(
        cipherCtx,
        this.context,
        skBuf,
        pkBuf,
      );
      if (result < 0) {
        throw new Error(`[noscrypt] decryption failed: ${result}`);
      }

      // Get output size
      const outputSize = this.lib.symbols.NCUtilCipherGetOutputSize(cipherCtx);
      if (outputSize < 0) {
        throw new Error(`[noscrypt] failed to get output size: ${outputSize}`);
      }

      // Read decrypted output
      const outputBuf = new Uint8Array(Number(outputSize));
      result = this.lib.symbols.NCUtilCipherReadOutput(
        cipherCtx,
        outputBuf,
        outputBuf.length,
      );
      if (result < 0) {
        throw new Error(`[noscrypt] failed to read output: ${result}`);
      }

      // Decode UTF-8 plaintext
      return bytesToUtf8.decode(outputBuf);
    } finally {
      // Always free the cipher context
      this.lib.symbols.NCUtilCipherFree(cipherCtx);
    }
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
