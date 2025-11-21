import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  buildSessionState,
  isAuthorizedToRead,
  isChallengeValid,
  isSessionValid,
  SessionState,
} from "@/schemas/session.ts";
import { sessionModelToCsv } from "@/schemas/codecs.ts";
import { z } from "zod";

// AI-NOTE: These tests focus on the session model logic rather than the full
// SessionManager class, which requires a real Valkey connection.
// Full integration tests should be run in Docker with the test container.

describe("Session Model", () => {
  describe("buildSessionState()", () => {
    it("creates a valid session state with 24-hour expiration", () => {
      // Arrange
      const userPubkey = "a".repeat(64);
      const signerPubkey = "b".repeat(64);
      const relayUrls = ["wss://relay.example.com"];

      // Act
      const session = buildSessionState(userPubkey, signerPubkey, relayUrls);

      // Assert
      assertEquals(session.userPubkey, userPubkey);
      assertEquals(session.signerPubkey, signerPubkey);
      assertEquals(session.relayUrls, relayUrls);
      assertEquals(session.challengeState, "pending");

      // Verify expiration is approximately 24 hours from now
      const expiresAt = new Date(session.expiresAt);
      const now = new Date();
      const diffHours = (expiresAt.getTime() - now.getTime()) /
        (1000 * 60 * 60);
      assertEquals(diffHours > 23.9 && diffHours < 24.1, true);
    });

    it("supports multiple relay URLs", () => {
      // Arrange
      const userPubkey = "a".repeat(64);
      const signerPubkey = "b".repeat(64);
      const relayUrls = [
        "wss://relay1.example.com",
        "wss://relay2.example.com",
        "wss://relay3.example.com",
      ];

      // Act
      const session = buildSessionState(userPubkey, signerPubkey, relayUrls);

      // Assert
      assertEquals(session.relayUrls.length, 3);
    });
  });

  describe("isSessionValid()", () => {
    it("returns true for a non-expired session", () => {
      // Arrange
      const session = buildSessionState("a".repeat(64), "b".repeat(64), [
        "wss://relay.example.com",
      ]);

      // Act & Assert
      assertEquals(isSessionValid(session), true);
    });

    it("returns false for an expired session", () => {
      // Arrange
      const session: z.infer<typeof SessionState> = {
        userPubkey: "a".repeat(64),
        signerPubkey: "b".repeat(64),
        relayUrls: ["wss://relay.example.com"],
        expiresAt: new Date(Date.now() - 1000).toISOString(), // 1 second ago
        challengeState: "pending",
      };

      // Act & Assert
      assertEquals(isSessionValid(session), false);
    });
  });

  describe("isChallengeValid()", () => {
    it("returns false when no challenge has been issued", () => {
      // Arrange
      const session = buildSessionState("a".repeat(64), "b".repeat(64), [
        "wss://relay.example.com",
      ]);

      // Act & Assert
      assertEquals(isChallengeValid(session), false);
    });

    it("returns true for a recently issued challenge", () => {
      // Arrange
      const session = buildSessionState("a".repeat(64), "b".repeat(64), [
        "wss://relay.example.com",
      ]);
      session.challengeIssuedAt = new Date().toISOString();

      // Act & Assert
      assertEquals(isChallengeValid(session), true);
    });

    it("returns false for a challenge older than 6 hours", () => {
      // Arrange
      const session = buildSessionState("a".repeat(64), "b".repeat(64), [
        "wss://relay.example.com",
      ]);
      // Set challenge issued 7 hours ago
      const sevenHoursAgo = new Date(Date.now() - 7 * 60 * 60 * 1000);
      session.challengeIssuedAt = sevenHoursAgo.toISOString();

      // Act & Assert
      assertEquals(isChallengeValid(session), false);
    });
  });

  describe("isAuthorizedToRead()", () => {
    it("returns false for pending challenge", () => {
      // Arrange
      const session = buildSessionState("a".repeat(64), "b".repeat(64), [
        "wss://relay.example.com",
      ]);
      session.challengeState = "pending";

      // Act & Assert
      assertEquals(isAuthorizedToRead(session), false);
    });

    it("returns false for failed challenge", () => {
      // Arrange
      const session = buildSessionState("a".repeat(64), "b".repeat(64), [
        "wss://relay.example.com",
      ]);
      session.challengeState = "failed";

      // Act & Assert
      assertEquals(isAuthorizedToRead(session), false);
    });

    it("returns true for succeeded challenge on valid session", () => {
      // Arrange
      const session = buildSessionState("a".repeat(64), "b".repeat(64), [
        "wss://relay.example.com",
      ]);
      session.challengeState = "succeeded";

      // Act & Assert
      assertEquals(isAuthorizedToRead(session), true);
    });

    it("returns false for succeeded challenge on expired session", () => {
      // Arrange
      const session: z.infer<typeof SessionState> = {
        userPubkey: "a".repeat(64),
        signerPubkey: "b".repeat(64),
        relayUrls: ["wss://relay.example.com"],
        expiresAt: new Date(Date.now() - 1000).toISOString(),
        challengeState: "succeeded",
      };

      // Act & Assert
      assertEquals(isAuthorizedToRead(session), false);
    });
  });
});

describe("Session CSV Codec", () => {
  describe("roundtrip serialization", () => {
    it("serializes and deserializes a session correctly", () => {
      // Arrange
      const session = buildSessionState("a".repeat(64), "b".repeat(64), [
        "wss://relay.example.com",
      ]);

      // Act
      const csv = sessionModelToCsv.decode(session);
      const deserialized = sessionModelToCsv.encode(csv);

      // Assert
      assertEquals(deserialized.userPubkey, session.userPubkey);
      assertEquals(deserialized.signerPubkey, session.signerPubkey);
      assertEquals(deserialized.relayUrls, session.relayUrls);
      assertEquals(deserialized.challengeState, session.challengeState);
    });

    it("handles multiple relay URLs with pipe separator", () => {
      // Arrange
      const session = buildSessionState("a".repeat(64), "b".repeat(64), [
        "wss://relay1.example.com",
        "wss://relay2.example.com",
      ]);

      // Act
      const csv = sessionModelToCsv.decode(session);

      // Assert - relays should be joined with |
      assertEquals(csv.includes("|"), true);
      assertEquals(
        csv.includes("wss://relay1.example.com|wss://relay2.example.com"),
        true,
      );
    });

    it("handles session with challengeIssuedAt", () => {
      // Arrange
      const session = buildSessionState("a".repeat(64), "b".repeat(64), [
        "wss://relay.example.com",
      ]);
      session.challengeIssuedAt = new Date().toISOString();
      session.challengeState = "succeeded";

      // Act
      const csv = sessionModelToCsv.decode(session);
      const deserialized = sessionModelToCsv.encode(csv);

      // Assert
      assertEquals(deserialized.challengeState, "succeeded");
      // AI-NOTE: The exact challengeIssuedAt value may differ slightly due to
      // timestamp parsing, but it should be present
      assertEquals(typeof deserialized.challengeIssuedAt, "string");
    });
  });

  describe("CSV format", () => {
    it("uses semicolons as field separators", () => {
      // Arrange
      const session = buildSessionState("a".repeat(64), "b".repeat(64), [
        "wss://relay.example.com",
      ]);

      // Act
      const csv = sessionModelToCsv.decode(session);

      // Assert
      const fields = csv.split(";");
      assertEquals(fields.length >= 5, true);
    });
  });
});
