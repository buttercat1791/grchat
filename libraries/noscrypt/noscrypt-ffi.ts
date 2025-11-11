const NC_BIN_ABS_PATH = "/usr/local/lib/libnoscrypt.so";
const NC_SEC_KEY_SIZE = 0x20;
const NC_PUB_KEY_SIZE = 0x20;

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
    NCGetPublicKey: {
      parameters: ["buffer", "buffer", "buffer"];
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
      NCGetPublicKey: {
        parameters: [
          "buffer", // const NCContext* ctx
          "buffer", // const NCSecretKey* sk
          "buffer", // NCPublicKey* pk
        ],
        result: "i64",
      },
    });

    this.context = this.initContext();
  }

  /**
   * Gets the size of the context structure required by Noscrypt.
   *
   * @returns The size of the context structure in bytes.
   */
  private getContextSize(): number {
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
  private initContext(): ArrayBuffer {
    this.assertNotClosed();

    const ctxSize = this.getContextSize();
    const ctxBuf = new ArrayBuffer(ctxSize);

    const randBuf = new Uint8Array(32);
    crypto.getRandomValues(randBuf);

    const result = this.lib.symbols.NCInitContext(ctxBuf, randBuf);

    if (result < 0) {
      throw new Error("[noscrypt] failed to init context");
    }

    return ctxBuf;
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
   * Closes the dynamic library and releases resources.
   *
   * Must be called when done using the Noscrypt instance to prevent resource leaks.
   */
  close(): void {
    if (!this.isClosed) {
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

export { Noscrypt };
