/**
 * Client-side authentication error handler
 *
 * Provides utilities for detecting and handling authentication failures
 * on the client side, ensuring consistent redirect behavior across all
 * client components.
 */

/**
 * Checks if a fetch response indicates an authentication failure.
 *
 * @param response - The fetch Response object to check
 * @returns True if the response is 401 or 403
 */
export function isAuthError(response: Response): boolean {
  return response.status === 401 || response.status === 403;
}

/**
 * Handles authentication errors by redirecting to the login page.
 *
 * This function should be called when:
 * - A fetch request returns 401 (Unauthorized) or 403 (Forbidden)
 * - An SSE connection fails with auth-related errors
 * - Session validation fails on the client
 *
 * @param reason - Optional reason for the auth failure (for logging)
 */
export function handleAuthError(reason?: string): void {
  if (reason) {
    console.warn(`[auth] Authentication failed: ${reason}`);
  } else {
    console.warn("[auth] Authentication failed - redirecting to login");
  }

  // Redirect to login page
  globalThis.location.href = "/login";
}

/**
 * Wrapper for fetch that automatically handles authentication errors.
 *
 * @param input - Fetch request URL or Request object
 * @param init - Fetch request options
 * @returns Fetch Response if successful
 * @throws Redirects to login on 401/403 responses
 */
export async function fetchWithAuth(
  input: string | Request,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(input, init);

  if (isAuthError(response)) {
    // Try to get error message from response
    try {
      const errorData = await response.json();
      handleAuthError(errorData.error || "Session expired");
    } catch {
      handleAuthError("Session expired");
    }
    // This line is never reached due to redirect, but TypeScript needs it
    throw new Error("Redirecting to login");
  }

  return response;
}
