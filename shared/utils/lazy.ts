/**
 * Lazy<T> - Defers computation of a value until first access.
 *
 * Useful for values that depend on configuration or services that may not be
 * available at module import time.
 *
 * @example
 * ```ts
 * import { Lazy } from "@/shared/utils/lazy.ts";
 * import { getAuthConfig } from "@/features/config/index.ts";
 *
 * // This does NOT call getAuthConfig() at module import time
 * const authConfig = new Lazy(() => getAuthConfig());
 *
 * // getAuthConfig() is only called when .value is first accessed
 * const ttl = authConfig.value.nip46_pending.ttl;
 * ```
 */
export class Lazy<T> {
  #value: T | undefined = undefined;
  #isInitialized = false;
  #initializer: () => T;

  constructor(initializer: () => T) {
    this.#initializer = initializer;
  }

  /**
   * Gets the lazy value, initializing it on first access.
   * Subsequent accesses return the cached value.
   */
  get value(): T {
    if (!this.#isInitialized) {
      this.#value = this.#initializer();
      this.#isInitialized = true;
    }
    return this.#value!;
  }

  /**
   * Checks if the lazy value has been initialized without triggering initialization.
   */
  get isInitialized(): boolean {
    return this.#isInitialized;
  }

  /**
   * Resets the lazy value, forcing reinitialization on next access.
   * Useful for testing or hot-reloading scenarios.
   */
  reset(): void {
    this.#value = undefined;
    this.#isInitialized = false;
  }
}
