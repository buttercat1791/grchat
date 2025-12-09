/**
 * Access Denied Page
 *
 * Displayed when a user is not authorized to access the application
 * (not in allow list or in deny list).
 */

import { define } from "@/utils.ts";

export default define.page(function AccessDenied() {
  return (
    <div class="min-h-screen flex items-center justify-center bg-base-200">
      <div class="card w-96 bg-base-100 shadow-xl">
        <div class="card-body text-center">
          <div class="flex justify-center mb-4">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-24 w-24 text-error"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>

          <h2 class="card-title justify-center text-2xl">Access Denied</h2>

          <p class="py-4">
            You are not authorized to access this application. Please contact
            the administrator if you believe this is an error.
          </p>

          <div class="card-actions justify-center mt-4">
            <a href="/login" class="btn btn-primary">
              Return to Login
            </a>
          </div>
        </div>
      </div>
    </div>
  );
});
