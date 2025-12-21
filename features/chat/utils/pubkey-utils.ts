/**
 * Utility functions for working with Nostr public keys
 */

/**
 * Abbreviates a public key to first 4 and last 4 characters
 *
 * @param pubkey - Full public key (hex string)
 * @returns Abbreviated pubkey in format "abcd...wxyz"
 *
 * @example
 * abbreviatePubkey("1234567890abcdef1234567890abcdef")
 * // returns "1234...cdef"
 */
export function abbreviatePubkey(pubkey: string): string {
  if (!pubkey || pubkey.length < 8) {
    return pubkey;
  }
  return `${pubkey.slice(0, 4)}...${pubkey.slice(-4)}`;
}

/**
 * Copies text to clipboard
 *
 * @param text - Text to copy
 * @returns Promise that resolves when copy is complete
 * @throws Error if clipboard API is unavailable
 */
export async function copyToClipboard(text: string): Promise<void> {
  if (!navigator?.clipboard) {
    throw new Error("Clipboard API not available");
  }
  await navigator.clipboard.writeText(text);
}
