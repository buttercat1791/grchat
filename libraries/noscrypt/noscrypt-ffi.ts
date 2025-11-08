const NC_BIN_ABS_PATH = "/usr/local/lib/libnoscrypt.so";
const NC_SEC_KEY_SIZE = 0x20;
const NC_PUB_KEY_SIZE = 0x20;

function getContextSize(): number {
  const nclib = Deno.dlopen(NC_BIN_ABS_PATH, {
    NCGetContextStructSize: {
      parameters: [],
      result: "u32",
    },
  });

  const ctxSize = nclib.symbols.NCGetContextStructSize();

  nclib.close();
  return ctxSize;
}

/**
 * Initializes the context memory used by the Noscrypt library.
 *
 * @returns A pointer to the initialized context memory.
 *
 * @see https://www.vaughnnugent.com/resources/software/articles/b00e913d3927dfcb75c6877a1f0d6654e14042ca#func-ncinitcontext
 */
function initContext(): ArrayBuffer {
  const nclib = Deno.dlopen(NC_BIN_ABS_PATH, {
    NCInitContext: {
      parameters: [
        "buffer", // NCContext* ctx
        "buffer", // const uint8_t entropy[32]
      ],
      result: "i64",
    },
  });

  const ctxSize = getContextSize();
  const ctxBuf = new ArrayBuffer(ctxSize);

  const randBuf = new Uint8Array(32);
  crypto.getRandomValues(randBuf);

  const result = nclib.symbols.NCInitContext(ctxBuf, randBuf);
  nclib.close();

  if (result < 0) {
    throw new Error("[noscrypt] failed to init context");
  }

  return ctxBuf;
}

/**
 * Decode a public key from a secret key.
 *
 * @param secretKey - A 32-bit hex-encoded string representation of a secret key.
 *
 * @returns A pointer to the memory containing the public key.
 */
function getPublicKey(secretKey: string): string {
  const nclib = Deno.dlopen(NC_BIN_ABS_PATH, {
    NCGetPublicKey: {
      parameters: [
        "buffer", // const NCContext* ctx
        "buffer", // const NCSecretKey* sk
        "buffer", // NCPublicKey* pk
      ],
      result: "i64",
    },
  });

  const ctxBuf = initContext();
  const pkBuf = new Uint8Array(NC_PUB_KEY_SIZE);

  const skBuf = hexToUint8Array(secretKey);
  if (skBuf.length !== NC_SEC_KEY_SIZE) {
    throw new Error("Secret key must be a 32-bit hex encoded string.");
  }

  const result = nclib.symbols.NCGetPublicKey(ctxBuf, skBuf, pkBuf);
  nclib.close();

  if (result < 0) {
    throw new Error("[noscrypt] failed to decode public key");
  }

  return uint8ArrayToHex(pkBuf);
}

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

function uint8ArrayToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export { getPublicKey };
