import { assertEquals, assertThrows } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { Noscrypt } from "./noscrypt-ffi.ts";

interface Keypair {
  secret: string;
  public: string;
}

describe("Noscrypt.getPublicKey()", () => {
  let noscrypt: Noscrypt;

  beforeEach(() => {
    noscrypt = new Noscrypt();
  });

  afterEach(() => {
    noscrypt.close();
  });

  describe("public key derivation", () => {
    const samples: Keypair[] = [
      {
        secret:
          "98c642360e7163a66cee5d9a842b252345b6f3f3e21bd3b7635d5e6c20c7ea36",
        public:
          "0db15182c4ad3418b4fbab75304be7ade9cfa430a21c1c5320c9298f54ea5406",
      },
      {
        secret:
          "3032cb8da355f9e72c9a94bbabae80ca99d3a38de1aed094b432a9fe3432e1f2",
        public:
          "421181660af5d39eb95e48a0a66c41ae393ba94ffeca94703ef81afbed724e5a",
      },
    ];

    for (const keypair of samples) {
      it("derives the correct public key for a given secret key", () => {
        // Arrange
        const secretKey = keypair.secret;
        const expectedPublicKey = keypair.public;

        // Act
        const result = noscrypt.getPublicKey(secretKey);

        // Assert
        assertEquals(result, expectedPublicKey);
      });
    }
  });

  describe("edge case handling", () => {
    it("throws an error when the secret key is the wrong length", () => {
      // Arrange
      const invalidSecretKey =
        "98c642360e7163a66cee5d9a842b252345b6f3f3e21bd3b7635d5e6c20c7ea"; // 31 bytes

      // Act & Assert
      assertThrows(
        () => noscrypt.getPublicKey(invalidSecretKey),
        Error,
        "Secret key must be a 32-bit hex encoded string.",
      );
    });

    it("throws an error when the secret key contains non-hex characters", () => {
      // Arrange
      const invalidSecretKey =
        "98c642360e7163a66cee5d9a842b252345b6f3f3e21bd3b7635d5e6c20c7ea$$";

      // Act & Assert
      assertThrows(
        () => noscrypt.getPublicKey(invalidSecretKey),
        Error,
        "Invalid hex string.",
      );
    });

    it("throws an error when the secret key is an odd length", () => {
      // Arrange
      const invalidSecretKey =
        "98c642360e7163a66cee5d9a842b252345b6f3f3e21bd3b7635d5e6c20c7ea3"; // Odd length

      // Act & Assert
      assertThrows(
        () => noscrypt.getPublicKey(invalidSecretKey),
        Error,
        "Hex string must have an even number of characters.",
      );
    });

    it("normalizes an uppercase secret key to lowercase", () => {
      // Arrange
      const secretKey =
        "98C642360E7163A66CEE5D9A842B252345B6F3F3E21BD3B7635D5E6C20C7EA36";
      const expectedPublicKey =
        "0db15182c4ad3418b4fbab75304be7ade9cfa430a21c1c5320c9298f54ea5406";

      // Act
      const result = noscrypt.getPublicKey(secretKey);

      // Assert
      assertEquals(result, expectedPublicKey);
    });

    it("allows the secret key to have a 0x prefix", () => {
      // Arrange
      const secretKey =
        "0x98c642360e7163a66cee5d9a842b252345b6f3f3e21bd3b7635d5e6c20c7ea36";
      const expectedPublicKey =
        "0db15182c4ad3418b4fbab75304be7ade9cfa430a21c1c5320c9298f54ea5406";

      // Act
      const result = noscrypt.getPublicKey(secretKey);

      // Assert
      assertEquals(result, expectedPublicKey);
    });
  });
});
