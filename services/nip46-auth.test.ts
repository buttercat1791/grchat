import { assertEquals, assertThrows } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { Nip46Error, Nip46Service } from "./nip46-auth.ts";
import { RelayPool } from "./relay-pool.ts";

describe("Nip46Service.generateNostrconnectUrl()", () => {
  describe("URL generation", () => {
    it("generates a valid nostrconnect:// URL", () => {
      // Arrange
      const relayPool = new RelayPool();
      const service = new Nip46Service(relayPool);
      const relayUrls = ["wss://relay.example.com"];

      // Act
      const result = service.generateNostrconnectUrl(relayUrls);

      // Assert
      assertEquals(result.url.startsWith("nostrconnect://"), true);
      assertEquals(result.connection.relayUrls, relayUrls);
      assertEquals(result.connection.clientPubkey.length, 64);
      assertEquals(result.connection.clientSecretKey.length, 64);
      assertEquals(typeof result.connection.secret, "string");

      relayPool.close();
    });

    it("includes relay URL in query parameters", () => {
      // Arrange
      const relayPool = new RelayPool();
      const service = new Nip46Service(relayPool);
      const relayUrls = ["wss://relay.example.com"];

      // Act
      const result = service.generateNostrconnectUrl(relayUrls);

      // Assert
      assertEquals(
        result.url.includes("relay=wss%3A%2F%2Frelay.example.com"),
        true,
      );

      relayPool.close();
    });

    it("includes multiple relay URLs", () => {
      // Arrange
      const relayPool = new RelayPool();
      const service = new Nip46Service(relayPool);
      const relayUrls = [
        "wss://relay1.example.com",
        "wss://relay2.example.com",
      ];

      // Act
      const result = service.generateNostrconnectUrl(relayUrls);

      // Assert
      assertEquals(
        result.url.includes("relay=wss%3A%2F%2Frelay1.example.com"),
        true,
      );
      assertEquals(
        result.url.includes("relay=wss%3A%2F%2Frelay2.example.com"),
        true,
      );

      relayPool.close();
    });

    it("includes secret in query parameters", () => {
      // Arrange
      const relayPool = new RelayPool();
      const service = new Nip46Service(relayPool);
      const relayUrls = ["wss://relay.example.com"];

      // Act
      const result = service.generateNostrconnectUrl(relayUrls);

      // Assert
      assertEquals(result.url.includes("secret="), true);
      assertEquals(result.connection.secret!.length, 32); // 16 bytes = 32 hex chars

      relayPool.close();
    });

    it("includes app metadata when provided", () => {
      // Arrange
      const relayPool = new RelayPool();
      const service = new Nip46Service(relayPool);
      const relayUrls = ["wss://relay.example.com"];
      const metadata = {
        name: "Test App",
        url: "https://test.example.com",
        image: "https://test.example.com/icon.png",
        perms: "sign_event:11,sign_event:1111",
      };

      // Act
      const result = service.generateNostrconnectUrl(relayUrls, metadata);

      // Assert
      assertEquals(result.url.includes("name=Test+App"), true);
      assertEquals(
        result.url.includes("url=https%3A%2F%2Ftest.example.com"),
        true,
      );
      assertEquals(result.url.includes("image="), true);
      assertEquals(result.url.includes("perms="), true);

      relayPool.close();
    });

    it("throws when no relay URLs provided", () => {
      // Arrange
      const relayPool = new RelayPool();
      const service = new Nip46Service(relayPool);

      // Act & Assert
      assertThrows(
        () => service.generateNostrconnectUrl([]),
        Nip46Error,
        "At least one relay URL is required",
      );

      relayPool.close();
    });
  });

  describe("URL structure", () => {
    it("uses client pubkey as URL path", () => {
      // Arrange
      const relayPool = new RelayPool();
      const service = new Nip46Service(relayPool);
      const relayUrls = ["wss://relay.example.com"];

      // Act
      const result = service.generateNostrconnectUrl(relayUrls);

      // Assert - URL format is nostrconnect://<pubkey>?...
      const url = new URL(result.url.replace("nostrconnect://", "https://"));
      assertEquals(url.pathname.slice(1), result.connection.clientPubkey);

      relayPool.close();
    });
  });
});

describe("Nip46Service.parseBunkerUrl()", () => {
  describe("valid bunker URLs", () => {
    it("parses a valid bunker URL", () => {
      // Arrange
      const relayPool = new RelayPool();
      const service = new Nip46Service(relayPool);
      const signerPubkey = "a".repeat(64);
      const bunkerUrl =
        `bunker://${signerPubkey}?relay=wss%3A%2F%2Frelay.example.com`;

      // Act
      const result = service.parseBunkerUrl(bunkerUrl);

      // Assert
      assertEquals(result.signerPubkey, signerPubkey);
      assertEquals(result.relayUrls, ["wss://relay.example.com"]);
      assertEquals(result.clientPubkey.length, 64);
      assertEquals(result.clientSecretKey.length, 64);

      relayPool.close();
    });

    it("parses bunker URL with secret", () => {
      // Arrange
      const relayPool = new RelayPool();
      const service = new Nip46Service(relayPool);
      const signerPubkey = "b".repeat(64);
      const secret = "mysecret123";
      const bunkerUrl =
        `bunker://${signerPubkey}?relay=wss%3A%2F%2Frelay.example.com&secret=${secret}`;

      // Act
      const result = service.parseBunkerUrl(bunkerUrl);

      // Assert
      assertEquals(result.secret, secret);

      relayPool.close();
    });

    it("parses bunker URL with multiple relays", () => {
      // Arrange
      const relayPool = new RelayPool();
      const service = new Nip46Service(relayPool);
      const signerPubkey = "c".repeat(64);
      const bunkerUrl =
        `bunker://${signerPubkey}?relay=wss%3A%2F%2Frelay1.example.com&relay=wss%3A%2F%2Frelay2.example.com`;

      // Act
      const result = service.parseBunkerUrl(bunkerUrl);

      // Assert
      assertEquals(result.relayUrls.length, 2);
      assertEquals(result.relayUrls[0], "wss://relay1.example.com");
      assertEquals(result.relayUrls[1], "wss://relay2.example.com");

      relayPool.close();
    });
  });

  describe("invalid bunker URLs", () => {
    it("throws for non-bunker protocol", () => {
      // Arrange
      const relayPool = new RelayPool();
      const service = new Nip46Service(relayPool);
      const badUrl = "nostrconnect://pubkey?relay=wss://relay.example.com";

      // Act & Assert
      assertThrows(
        () => service.parseBunkerUrl(badUrl),
        Nip46Error,
        "must start with bunker://",
      );

      relayPool.close();
    });

    it("throws for invalid signer pubkey", () => {
      // Arrange
      const relayPool = new RelayPool();
      const service = new Nip46Service(relayPool);
      const badUrl = "bunker://invalid-pubkey?relay=wss://relay.example.com";

      // Act & Assert
      assertThrows(
        () => service.parseBunkerUrl(badUrl),
        Nip46Error,
        "invalid signer public key",
      );

      relayPool.close();
    });

    it("throws when no relay provided", () => {
      // Arrange
      const relayPool = new RelayPool();
      const service = new Nip46Service(relayPool);
      const signerPubkey = "d".repeat(64);
      const badUrl = `bunker://${signerPubkey}`;

      // Act & Assert
      assertThrows(
        () => service.parseBunkerUrl(badUrl),
        Nip46Error,
        "at least one relay is required",
      );

      relayPool.close();
    });

    it("throws for pubkey that is too short", () => {
      // Arrange
      const relayPool = new RelayPool();
      const service = new Nip46Service(relayPool);
      const shortPubkey = "a".repeat(62);
      const badUrl = `bunker://${shortPubkey}?relay=wss://relay.example.com`;

      // Act & Assert
      assertThrows(
        () => service.parseBunkerUrl(badUrl),
        Nip46Error,
        "invalid signer public key",
      );

      relayPool.close();
    });
  });
});
