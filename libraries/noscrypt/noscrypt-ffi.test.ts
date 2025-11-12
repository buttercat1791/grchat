import { assertEquals, assertThrows } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { type Keypair, Noscrypt } from "./noscrypt-ffi.ts";
import { assertNotEquals } from "@std/assert/not-equals";

interface SignatureTestCase {
  secretKey: string;
  publicKey: string;
  data: string;
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
        secretKey:
          "98c642360e7163a66cee5d9a842b252345b6f3f3e21bd3b7635d5e6c20c7ea36",
        publicKey:
          "0db15182c4ad3418b4fbab75304be7ade9cfa430a21c1c5320c9298f54ea5406",
      },
      {
        secretKey:
          "3032cb8da355f9e72c9a94bbabae80ca99d3a38de1aed094b432a9fe3432e1f2",
        publicKey:
          "421181660af5d39eb95e48a0a66c41ae393ba94ffeca94703ef81afbed724e5a",
      },
    ];

    for (const keypair of samples) {
      it("derives the correct public key for a given secret key", () => {
        // Arrange
        const secretKey = keypair.secretKey;
        const expectedPublicKey = keypair.publicKey;

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

describe("Noscrypt.validateSecretKey()", () => {
  let noscrypt: Noscrypt;

  beforeEach(() => {
    noscrypt = new Noscrypt();
  });

  afterEach(() => {
    noscrypt.close();
  });

  describe("successful secret key validation", () => {
    const validKeys: string[] = [
      "98c642360e7163a66cee5d9a842b252345b6f3f3e21bd3b7635d5e6c20c7ea36",
      "3032cb8da355f9e72c9a94bbabae80ca99d3a38de1aed094b432a9fe3432e1f2",
    ];

    for (const secretKey of validKeys) {
      it("returns true for a valid secret key", () => {
        // Act
        const result = noscrypt.validateSecretKey(secretKey);

        // Assert
        assertEquals(result, true);
      });
    }
  });

  describe("failed secret key validation", () => {
    it("returns false for an all-zero secret key", () => {
      // Arrange
      const zeroKey = "0".repeat(64);

      // Act
      const result = noscrypt.validateSecretKey(zeroKey);

      // Assert
      assertEquals(result, false);
    });

    it("throws an error when the secret key is the wrong length", () => {
      // Arrange
      const invalidSecretKey =
        "98c642360e7163a66cee5d9a842b252345b6f3f3e21bd3b7635d5e6c20c7ea"; // 31 bytes

      // Act & Assert
      assertThrows(
        () => noscrypt.validateSecretKey(invalidSecretKey),
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
        () => noscrypt.validateSecretKey(invalidSecretKey),
        Error,
        "Invalid hex string.",
      );
    });
  });
});

describe("Noscrypt.signData()", () => {
  let noscrypt: Noscrypt;

  beforeEach(() => {
    noscrypt = new Noscrypt();
  });

  afterEach(() => {
    noscrypt.close();
  });

  describe("data signing", () => {
    const testCase: SignatureTestCase = {
      secretKey:
        "98c642360e7163a66cee5d9a842b252345b6f3f3e21bd3b7635d5e6c20c7ea36",
      publicKey:
        "0db15182c4ad3418b4fbab75304be7ade9cfa430a21c1c5320c9298f54ea5406",
      data: "Test message to sign",
    };

    it("signs data with a secret key and returns a 64-byte signature", () => {
      // Act
      const signature = noscrypt.signData(testCase.secretKey, testCase.data);

      // Assert
      assertEquals(signature.length, 128); // 64 bytes * 2 hex chars
    });

    it("produces different signatures for different data", () => {
      // Arrange
      const message1 = "First message";
      const message2 = "Second message";

      // Act
      const sig1 = noscrypt.signData(testCase.secretKey, message1);
      const sig2 = noscrypt.signData(testCase.secretKey, message2);

      // Assert
      assertEquals(sig1.length, 128);
      assertEquals(sig2.length, 128);
      assertNotEquals(sig1, sig2);
    });

    it("throws an error when the secret key is invalid", () => {
      // Arrange
      const invalidSecretKey =
        "98c642360e7163a66cee5d9a842b252345b6f3f3e21bd3b7635d5e6c20c7ea"; // 31 bytes

      // Act & Assert
      assertThrows(
        () => noscrypt.signData(invalidSecretKey, testCase.data),
        Error,
        "Secret key must be a 32-bit hex encoded string.",
      );
    });
  });
});

describe("Noscrypt.verifyData()", () => {
  let noscrypt: Noscrypt;

  beforeEach(() => {
    noscrypt = new Noscrypt();
  });

  afterEach(() => {
    noscrypt.close();
  });

  describe("signature verification", () => {
    const testCase: SignatureTestCase = {
      secretKey:
        "98c642360e7163a66cee5d9a842b252345b6f3f3e21bd3b7635d5e6c20c7ea36",
      publicKey:
        "0db15182c4ad3418b4fbab75304be7ade9cfa430a21c1c5320c9298f54ea5406",
      data: "Test message to sign",
    };

    it("verifies a valid signature", () => {
      // AI-TODO: Use pre-prepared examples rather than invoking `signData`.
      // Arrange
      const signature = noscrypt.signData(testCase.secretKey, testCase.data);

      // Act
      const isValid = noscrypt.verifyData(
        testCase.publicKey,
        testCase.data,
        signature,
      );

      // Assert
      assertEquals(isValid, true);
    });

    it("returns false for a corrupted signature", () => {
      // Arrange
      const signature = noscrypt.signData(testCase.secretKey, testCase.data);
      // Corrupt the signature by changing the first byte
      const corruptedSignature = "ff" + signature.substring(2);

      // Act
      const isValid = noscrypt.verifyData(
        testCase.publicKey,
        testCase.data,
        corruptedSignature,
      );

      // Assert
      assertEquals(isValid, false);
    });

    it("returns false when verifying with wrong public key", () => {
      // Arrange
      const signature = noscrypt.signData(testCase.secretKey, testCase.data);
      const wrongPublicKey =
        "421181660af5d39eb95e48a0a66c41ae393ba94ffeca94703ef81afbed724e5a";

      // Act
      const isValid = noscrypt.verifyData(
        wrongPublicKey,
        testCase.data,
        signature,
      );

      // Assert
      assertEquals(isValid, false);
    });

    it("returns false when verifying different data than was signed", () => {
      // Arrange
      const originalData = "Original message";
      const differentData = "Different message";
      const signature = noscrypt.signData(testCase.secretKey, originalData);

      // Act
      const isValid = noscrypt.verifyData(
        testCase.publicKey,
        differentData,
        signature,
      );

      // Assert
      assertEquals(isValid, false);
    });

    it("throws an error when the public key is invalid", () => {
      // Arrange
      const signature = noscrypt.signData(testCase.secretKey, testCase.data);
      const invalidPublicKey =
        "0db15182c4ad3418b4fbab75304be7ade9cfa430a21c1c5320c9298f54ea54"; // 31 bytes

      // Act & Assert
      assertThrows(
        () => noscrypt.verifyData(invalidPublicKey, testCase.data, signature),
        Error,
        "Public key must be a 32-bit hex encoded string.",
      );
    });

    it("throws an error when the signature is invalid", () => {
      // Arrange
      const invalidSignature = "abcd"; // Too short

      // Act & Assert
      assertThrows(
        () =>
          noscrypt.verifyData(
            testCase.publicKey,
            testCase.data,
            invalidSignature,
          ),
        Error,
        "Signature must be a 64-bit hex encoded string.",
      );
    });
  });
});

describe("Noscrypt.generateKeypair()", () => {
  let noscrypt: Noscrypt;

  beforeEach(() => {
    noscrypt = new Noscrypt();
  });

  afterEach(() => {
    noscrypt.close();
  });

  describe("keypair generation", () => {
    it("generates a valid keypair", () => {
      // Act
      const keypair = noscrypt.generateKeypair();

      // Assert
      assertEquals(keypair.secretKey.length, 64); // 32 bytes * 2 hex chars
      assertEquals(keypair.publicKey.length, 64); // 32 bytes * 2 hex chars
    });

    it("generates a unique keypair on each call", () => {
      // Act
      const keypair1 = noscrypt.generateKeypair();
      const keypair2 = noscrypt.generateKeypair();

      // Assert
      assertNotEquals(keypair1.secretKey, keypair2.secretKey);
      assertNotEquals(keypair1.publicKey, keypair2.publicKey);
    });
  });
});
