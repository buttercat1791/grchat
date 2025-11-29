/**
 * NIP-46 Remote Signing Service
 *
 * Implements the NIP-46 protocol for authenticating users via remote signers.
 * Handles both client-initiated (nostrconnect://) and signer-initiated (bunker://)
 * connection flows.
 *
 * @see https://github.com/nostr-protocol/nips/blob/master/46.md
 */

import { z } from "zod";
import { Noscrypt } from "@/libraries/noscrypt/noscrypt-ffi.ts";
import {
  NIDSchema,
  type NostrEvent,
  type NostrEventBase,
  NostrEventBaseSchema,
  NostrEventSchema,
} from "@/schemas/nostr-events.ts";
import { RelayPool } from "./relay-pool.ts";
import { signEvent } from "./nostr/crypto.ts";

/**
 * Error thrown when NIP-46 operations fail.
 */
export class Nip46Error extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "Nip46Error";
  }
}

/**
 * NIP-46 request payload structure.
 */
const Nip46RequestSchema = z.object({
  id: z.string(),
  method: z.string(),
  params: z.array(z.string()),
});
type Nip46Request = z.infer<typeof Nip46RequestSchema>;

/**
 * NIP-46 response payload structure.
 */
const Nip46ResponseSchema = z.object({
  id: z.string(),
  result: z.string().optional(),
  error: z.string().optional(),
});
type Nip46Response = z.infer<typeof Nip46ResponseSchema>;

/**
 * Zod schema for NIP-46 connection state.
 */
export const Nip46ConnectionSchema = z.object({
  /** Ephemeral secret key for this connection session */
  clientSecretKey: z.string(),
  /** Ephemeral public key derived from clientSecretKey */
  clientPubkey: z.string(),
  /** Public key of the remote signer application */
  signerPubkey: z.string(),
  /** Relay URLs where the signer is listening */
  relayUrls: z.array(z.string()),
  /** Optional handshake secret for verification */
  secret: z.string().optional(),
});
export type Nip46Connection = z.infer<typeof Nip46ConnectionSchema>;

/**
 * Zod schema for nostrconnect:// URL result.
 */
const NostrconnectResultSchema = z.object({
  /** The nostrconnect:// URL to present to the user */
  url: z.string(),
  /** The connection state to use for completing the handshake */
  connection: Nip46ConnectionSchema.omit({ signerPubkey: true }),
});
export type NostrconnectResult = z.infer<typeof NostrconnectResultSchema>;

/**
 * Zod schema for application metadata.
 */
const AppMetadataSchema = z.object({
  /** Application name */
  name: z.string().optional(),
  /** Application URL */
  url: z.string().optional(),
  /** Application icon URL */
  image: z.string().optional(),
  /** Requested permissions (comma-separated) */
  perms: z.string().optional(),
});
export type AppMetadata = z.infer<typeof AppMetadataSchema>;

/**
 * Zod schema for handshake result.
 */
const HandshakeResultSchema = z.object({
  /** The user's actual public key (identity) */
  userPubkey: z.string(),
  /** The complete connection state */
  connection: Nip46ConnectionSchema,
});
export type HandshakeResult = z.infer<typeof HandshakeResultSchema>;

/**
 * NIP-46 event kind for request/response messages.
 */
const NIP46_KIND = 24133;

/**
 * Default timeout for NIP-46 operations in milliseconds.
 */
const DEFAULT_TIMEOUT = 30000;

/**
 * Zod schema for pending request entry.
 */
const PendingRequestEntrySchema = z.object({
  resolve: z.function({
    input: [Nip46ResponseSchema],
    output: z.void(),
  }),
  reject: z.function({
    input: [Nip46ResponseSchema],
    output: z.void(),
  }),
  timeout: z.number(),
});
type PendingRequestEntry = z.infer<typeof PendingRequestEntrySchema>;

/**
 * Map of pending NIP-46 requests.
 */
const PendingRequestsMapSchema = z.map(z.string(), PendingRequestEntrySchema);
type PendingRequestsMap = z.infer<typeof PendingRequestsMapSchema>;

const GetUserPublicKeySchema = z.function({
  input: [Nip46ConnectionSchema],
  output: z.promise(z.string()),
});

/**
 * Zod schema for handshake context validation.
 */
const HandshakeContextSchema = z.object({
  clientSecretKey: z.string(),
  clientPubkey: z.string(),
  relayUrls: z.array(z.string()),
  secret: z.string().optional(),
  resolve: z.function({
    input: [HandshakeResultSchema],
    output: z.void(),
  }),
  reject: z.function({
    input: [z.any()], // Generic error type
    output: z.void(),
  }),
  clearTimeout: z.function({
    input: [],
    output: z.void(),
  }),
  getSubId: z.function({
    input: [],
    output: z.union([z.string(), z.undefined()]),
  }),
  unsubscribeAll: z.function({
    input: [],
    output: z.void(),
  }),
  getUserPublicKey: GetUserPublicKeySchema,
});
type HandshakeContext = z.infer<typeof HandshakeContextSchema>;

/**
 * Zod schema for pending request context validation.
 */
const PendingRequestContextSchema = z.object({
  requestId: z.string(),
  method: z.string(),
  timeout: z.number(),
  pendingRequests: PendingRequestsMapSchema,
});
type PendingRequestContext = z.infer<typeof PendingRequestContextSchema>;

/**
 * Zod schema for response handler context validation.
 */
const ResponseHandlerContextSchema = z.object({
  connection: Nip46ConnectionSchema,
  pendingRequests: PendingRequestsMapSchema,
});
type ResponseHandlerContext = z.infer<typeof ResponseHandlerContextSchema>;

/**
 * Handles handshake events from the remote signer.
 *
 * @param this - The function's `this` context, to be set with `bind`
 * @param event - The Nostr event to process
 *
 * @throws a Zod error if the bound context is invalid.
 */
function handleHandshakeEvent(
  this: HandshakeContext,
  event: NostrEvent,
): void {
  // Precondition: validate bound context
  const ctx = HandshakeContextSchema.parse(this);
  const ev = NostrEventSchema.parse(event);

  if (ev.kind !== NIP46_KIND) return;

  // Decrypt the message
  using noscrypt = new Noscrypt();
  const decrypted = noscrypt.decryptNip44(
    ctx.clientSecretKey,
    ev.pubkey,
    ev.content,
  );

  const response = Nip46ResponseSchema.parse(JSON.parse(decrypted));

  // Confirm that the connection response contains the secret, or that it contains no secret if
  // none is expected.
  if (
    response.result === ctx.secret ||
    (ctx.secret && response.result?.includes(ctx.secret))
  ) {
    ctx.clearTimeout();

    // Complete the connection
    const connection = Nip46ConnectionSchema.parse({
      clientSecretKey: ctx.clientSecretKey,
      clientPubkey: ctx.clientPubkey,
      signerPubkey: event.pubkey,
      relayUrls: ctx.relayUrls,
      secret: ctx.secret,
    });

    // Get the user's actual public key
    const userPubkey = ctx.getUserPublicKey(connection);

    ctx.unsubscribeAll();

    ctx.resolve({
      userPubkey,
      connection,
    });
  }
}

/**
 * Sets up a pending request with timeout handling.
 *
 * @param this - The function's `this` context, to be set with `bind`
 *
 * @returns A promise that resolves when the response is received
 *
 * @throws a Zod error if the bound context is invalid.
 */
function setupPendingRequest(this: PendingRequestContext): Promise<
  Nip46Response
> {
  // Precondition: validate bound context
  const ctx = PendingRequestContextSchema.parse(this);

  return new Promise<Nip46Response>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      ctx.pendingRequests.delete(ctx.requestId);
      reject(new Nip46Error(`Request ${ctx.method} timed out`));
    }, ctx.timeout);

    ctx.pendingRequests.set(ctx.requestId, {
      resolve,
      reject,
      timeout: timeoutId,
    });
  });
}

/**
 * Handles response events from the remote signer.
 *
 * @param this - The function's `this` context, to be set with `bind`
 * @param event - The Nostr event to process
 *
 * @throws a Zod error if the bound context is invalid
 */
function handleSignerResponse(
  this: ResponseHandlerContext,
  event: NostrEvent,
): void {
  // Precondition: validate bound context
  const ctx = ResponseHandlerContextSchema.parse(this);
  const ev = NostrEventSchema.parse(event);

  if (ev.kind !== NIP46_KIND) return;
  if (ev.pubkey !== ctx.connection.signerPubkey) return;

  try {
    using nc = new Noscrypt();
    const decrypted = nc.decryptNip44(
      ctx.connection.clientSecretKey,
      ev.pubkey,
      ev.content,
    );

    const response = Nip46ResponseSchema.parse(JSON.parse(decrypted));

    const pending = ctx.pendingRequests.get(response.id);
    if (pending) {
      clearTimeout(pending.timeout);
      ctx.pendingRequests.delete(response.id);
      pending.resolve(response);
    }
  } catch {
    // Ignore decryption failures
  }
}

/**
 * NIP-46 Remote Signing Service
 *
 * @example Client-initiated flow (nostrconnect://)
 * ```ts
 * const service = new Nip46Service(relayPool);
 *
 * // Generate URL for user to scan
 * const { url, connection } = service.generateNostrconnectUrl(
 *   ["wss://relay.example.com"],
 *   { name: "My App" }
 * );
 *
 * // Wait for signer response and complete handshake
 * const result = await service.awaitHandshake(connection);
 * console.log("User pubkey:", result.userPubkey);
 * ```
 *
 * @example Signer-initiated flow (bunker://)
 * ```ts
 * const service = new Nip46Service(relayPool);
 *
 * // Parse bunker URL from user
 * const connection = service.parseBunkerUrl(bunkerUrl);
 *
 * // Complete handshake
 * const result = await service.completeHandshake(connection);
 * console.log("User pubkey:", result.userPubkey);
 * ```
 */
export class Nip46Service {
  #relayPool: RelayPool;
  #pendingRequests: PendingRequestsMap = new Map();

  constructor(relayPool: RelayPool) {
    this.#relayPool = relayPool;
  }

  /**
   * Generates a nostrconnect:// URL for client-initiated connections.
   *
   * @param relayUrls - Relay URLs where grchat will listen for the signer's response
   * @param metadata - Optional application metadata
   * @returns The URL and connection state
   */
  generateNostrconnectUrl(
    relayUrls: string[],
    metadata?: AppMetadata,
  ): NostrconnectResult {
    // TODO: Define a Zod codec for a nostrconnect URL for ease of serialization.
    const meta = AppMetadataSchema.parse(metadata);

    if (relayUrls.length === 0) {
      throw new Nip46Error("At least one relay URL is required");
    }

    // Generate ephemeral keypair for this connection
    using noscrypt = new Noscrypt();
    const { secretKey, publicKey } = noscrypt.generateKeypair();

    // Generate random secret for handshake verification
    const secretBytes = new Uint8Array(16);
    crypto.getRandomValues(secretBytes);
    const secret = Array.from(secretBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Build nostrconnect:// URL
    const params = new URLSearchParams();
    for (const relay of relayUrls) {
      params.append("relay", relay);
    }
    params.append("secret", secret);

    if (meta?.name) params.append("name", meta.name);
    if (meta?.url) params.append("url", meta.url);
    if (meta?.image) params.append("image", meta.image);
    if (meta?.perms) params.append("perms", meta.perms);

    const url = `nostrconnect://${publicKey}?${params.toString()}`;

    return {
      url,
      connection: {
        clientSecretKey: secretKey,
        clientPubkey: publicKey,
        relayUrls,
        secret,
      },
    };
  }

  /**
   * Parses a bunker:// URL for signer-initiated connections.
   *
   * @param bunkerUrl - The bunker:// URL provided by the user
   * @returns The connection state
   *
   * @throws {Nip46Error} If the URL is invalid
   */
  parseBunkerUrl(bunkerUrl: string): Nip46Connection {
    // TODO: Define a Zod codec for a bunker URL for ease of parsing.
    if (!bunkerUrl.startsWith("bunker://")) {
      throw new Nip46Error("Invalid bunker URL: must start with bunker://");
    }

    // Parse URL
    const urlPart = bunkerUrl.slice(9); // Remove "bunker://"
    const [signerPubkey, queryString] = urlPart.split("?");

    // Validate signer pubkey
    try {
      NIDSchema.parse(signerPubkey);
    } catch {
      throw new Nip46Error("Invalid bunker URL: invalid signer public key");
    }

    // Parse query parameters
    const params = new URLSearchParams(queryString || "");
    const relayUrls = params.getAll("relay");

    if (relayUrls.length === 0) {
      throw new Nip46Error(
        "Invalid bunker URL: at least one relay is required",
      );
    }

    const secret = params.get("secret") || undefined;

    // Generate ephemeral keypair for this connection
    using noscrypt = new Noscrypt();
    const { secretKey, publicKey } = noscrypt.generateKeypair();

    return {
      clientSecretKey: NIDSchema.parse(secretKey),
      clientPubkey: NIDSchema.parse(publicKey),
      signerPubkey,
      relayUrls,
      secret,
    };
  }

  /**
   * Awaits a signer's response to a nostrconnect:// (client-initiated) connection.
   *
   * @param partialConnection - The connection state from generateNostrconnectUrl
   * @param timeout - Timeout in milliseconds (default: 30s)
   * @returns The completed handshake result
   *
   * @throws {Nip46Error} If the handshake times out or fails
   */
  async awaitHandshake(
    connectionData: Omit<Nip46Connection, "signerPubkey">,
    timeout: number = DEFAULT_TIMEOUT,
  ): Promise<HandshakeResult> {
    const { clientSecretKey, clientPubkey, relayUrls, secret } =
      Nip46ConnectionSchema.omit({ signerPubkey: true }).parse(connectionData);

    // Connect to relays and subscribe for responses
    for (const relay of relayUrls) {
      await this.#relayPool.connect(relay);
    }

    return new Promise((resolve, reject) => {
      let ctx: HandshakeContext | null = null;
      const timeoutId = setTimeout(() => {
        ctx?.unsubscribeAll();
        reject(new Nip46Error("Handshake timed out"));
      }, timeout);

      let subId: string | undefined;

      ctx = {
        clientSecretKey,
        clientPubkey,
        relayUrls,
        secret,
        resolve,
        reject,
        clearTimeout: () => clearTimeout(timeoutId),
        getSubId: () => subId,
        unsubscribeAll: () => {
          for (const relay of relayUrls) {
            if (subId) this.#relayPool.unsubscribe(relay, subId);
          }
        },
        getUserPublicKey: GetUserPublicKeySchema.implement(
          (connection: Nip46Connection) => this.#getUserPublicKey(connection),
        ),
      };

      const handleEvent = handleHandshakeEvent.bind(ctx);

      // Subscribe on connection relays
      for (const relayUrl of relayUrls) {
        this.#relayPool
          .subscribe(relayUrl, [{
            kinds: [NIP46_KIND],
            "#p": [clientPubkey],
          }], handleEvent)
          .then((id) => {
            subId = id;
          })
          .catch((error) => {
            clearTimeout(timeoutId);
            reject(
              new Nip46Error("Failed to subscribe for handshake", {
                cause: error,
              }),
            );
          });
      }
    });
  }

  /**
   * Completes the handshake for a bunker:// (signer-initiated) connection.
   *
   * @param connection - The connection state from parseBunkerUrl
   * @returns The completed handshake result
   *
   * @throws {Nip46Error} If the handshake fails
   */
  async completeHandshake(
    connection: Nip46Connection,
  ): Promise<HandshakeResult> {
    const conn = Nip46ConnectionSchema.parse(connection);

    // If there's a secret, we need to send a connect acknowledgment first
    if (conn.secret) {
      await this.sendRemoteSignerRequest(conn, {
        id: crypto.randomUUID(),
        method: "connect",
        params: [conn.clientPubkey, conn.secret],
      });
    }

    // Get the user's actual public key
    const userPubkey = await this.#getUserPublicKey(conn);

    return {
      userPubkey,
      connection: conn,
    };
  }

  /**
   * Gets the user's public key from the remote signer.
   *
   * @param connection - The NIP-46 connection
   * @returns The user's public key
   */
  async #getUserPublicKey(connection: Nip46Connection): Promise<string> {
    const conn = Nip46ConnectionSchema.parse(connection);

    const response = await this.sendRemoteSignerRequest(conn, {
      id: crypto.randomUUID(),
      method: "get_public_key",
      params: [],
    });

    if (response.error) {
      throw new Nip46Error(`Failed to get public key: ${response.error}`);
    }

    if (!response.result) {
      throw new Nip46Error("No public key in response");
    }

    // Validate the public key format
    try {
      NIDSchema.parse(response.result);
    } catch {
      throw new Nip46Error("Invalid public key format in response");
    }

    return response.result;
  }

  /**
   * Sends a NIP-46 request to the remote signer.
   *
   * @param connection - The NIP-46 connection
   * @param request - The request payload
   * @param timeout - Timeout in milliseconds
   * @returns The response from the signer
   */
  async sendRemoteSignerRequest(
    connection: Nip46Connection,
    request: Nip46Request,
    timeout: number = DEFAULT_TIMEOUT,
  ): Promise<Nip46Response> {
    const conn = Nip46ConnectionSchema.parse(connection);
    const req = Nip46RequestSchema.parse(request);

    // Encrypt the request payload
    using noscrypt = new Noscrypt();
    const payload = JSON.stringify(req);
    const encrypted = noscrypt.encryptNip44(
      conn.clientSecretKey,
      conn.signerPubkey,
      payload,
    );

    // Create the NIP-46 event
    const baseEvent = NostrEventBaseSchema.parse({
      pubkey: conn.clientPubkey,
      created_at: Math.floor(Date.now() / 1000),
      kind: NIP46_KIND,
      tags: [["p", conn.signerPubkey]],
      content: encrypted,
    });

    // Sign the event
    const signedEvent = NostrEventSchema.parse(
      await signEvent(baseEvent, conn.clientSecretKey),
    );

    // Set up pending request using bind
    const responsePromise = setupPendingRequest.bind({
      requestId: req.id,
      method: req.method,
      timeout,
      pendingRequests: this.#pendingRequests,
    })();

    // Create response handler using bind
    const handleResponse = handleSignerResponse.bind({
      connection: conn,
      pendingRequests: this.#pendingRequests,
    });

    // Subscribe on first relay
    const subId = await this.#relayPool.subscribe(
      conn.relayUrls[0],
      [{ kinds: [NIP46_KIND], "#p": [conn.clientPubkey] }],
      handleResponse,
    );

    try {
      // Publish the request
      await this.#relayPool.publish(conn.relayUrls[0], signedEvent);

      // Wait for response
      return Nip46ResponseSchema.parse(await responsePromise);
    } finally {
      this.#relayPool.unsubscribe(conn.relayUrls[0], subId);
    }
  }

  /**
   * Sends a ping to the remote signer.
   *
   * @param connection - The NIP-46 connection
   * @param timeout - Timeout in milliseconds
   * @returns True if pong received, false otherwise
   */
  async ping(
    connection: Nip46Connection,
    timeout: number = 10000,
  ): Promise<boolean> {
    const conn = Nip46ConnectionSchema.parse(connection);

    try {
      const response = await this.sendRemoteSignerRequest(
        conn,
        {
          id: crypto.randomUUID(),
          method: "ping",
          params: [],
        },
        timeout,
      );

      return response.result === "pong";
    } catch {
      return false;
    }
  }

  /**
   * Requests the remote signer to sign an event.
   *
   * @param connection - The NIP-46 connection
   * @param event - The unsigned event to sign
   * @returns The signed event
   */
  async requestSignEvent(
    connection: Nip46Connection,
    event: NostrEventBase,
  ): Promise<NostrEvent> {
    const conn = Nip46ConnectionSchema.parse(connection);
    const ev = NostrEventBaseSchema.parse(event);

    const response = await this.sendRemoteSignerRequest(conn, {
      id: crypto.randomUUID(),
      method: "sign_event",
      params: [JSON.stringify(ev)],
    });
    const res = Nip46ResponseSchema.parse(response);

    if (res.error) {
      throw new Nip46Error(`Failed to sign event: ${res.error}`);
    }

    if (!res.result) {
      throw new Nip46Error("No signed event in response");
    }

    const signedEvent = JSON.parse(res.result);
    return NostrEventSchema.parse(signedEvent);
  }
}

/**
 * Creates a new NIP-46 service instance.
 *
 * @param relayPool - The relay pool to use for communication
 * @returns A new Nip46Service instance
 */
export function createNip46Service(relayPool: RelayPool): Nip46Service {
  return new Nip46Service(relayPool);
}
