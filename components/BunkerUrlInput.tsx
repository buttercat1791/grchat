import { useSignal } from "@preact/signals";

export interface BunkerUrlInputProps {
  onSubmit: (bunkerUrl: string) => void | Promise<void>;
  isLoading: boolean;
}

/**
 * Input component for signer-initiated authentication flow
 * Accepts a bunker:// URL from the user and validates it
 */
export function BunkerUrlInput({ onSubmit, isLoading }: BunkerUrlInputProps) {
  const bunkerUrl = useSignal<string>("");
  const validationError = useSignal<string>("");

  /**
   * Validate bunker URL format
   * AI-NOTE: Basic validation checks for bunker:// scheme
   */
  const validateBunkerUrl = (url: string): boolean => {
    if (!url.trim()) {
      validationError.value = "Please enter a bunker URL";
      return false;
    }

    if (!url.startsWith("bunker://")) {
      validationError.value = "URL must start with bunker://";
      return false;
    }

    // AI-NOTE: Additional validation can be added here as needed
    // For now, we just check the scheme prefix
    validationError.value = "";
    return true;
  };

  /**
   * Handle form submission
   */
  const handleSubmit = async (e: Event) => {
    e.preventDefault();

    if (!validateBunkerUrl(bunkerUrl.value)) {
      return;
    }

    await onSubmit(bunkerUrl.value);
  };

  /**
   * Handle input change with validation
   */
  const handleChange = (e: Event) => {
    const target = e.target as HTMLInputElement;
    bunkerUrl.value = target.value;

    // Clear validation error when user starts typing
    if (validationError.value) {
      validationError.value = "";
    }
  };

  /**
   * Handle paste event
   */
  const handlePaste = (_e: ClipboardEvent) => {
    // Allow default paste behavior
    // Validation will occur on change/submit
  };

  return (
    <form onSubmit={handleSubmit} class="w-full max-w-md">
      <div class="form-control w-full">
        <label class="label">
          <span class="label-text">Bunker URL</span>
        </label>
        <input
          type="text"
          placeholder="bunker://..."
          value={bunkerUrl.value}
          onInput={handleChange}
          onPaste={handlePaste}
          disabled={isLoading}
          class={`input input-bordered w-full font-mono text-sm ${
            validationError.value ? "input-error" : ""
          }`}
        />
        {validationError.value && (
          <label class="label">
            <span class="label-text-alt text-error">
              {validationError.value}
            </span>
          </label>
        )}
        <label class="label">
          <span class="label-text-alt opacity-70">
            Paste the connection URL from your signer app
          </span>
        </label>
      </div>

      <button
        type="submit"
        disabled={isLoading || !bunkerUrl.value.trim()}
        class="btn btn-primary w-full mt-4"
      >
        {isLoading
          ? (
            <>
              <span class="loading loading-spinner loading-sm"></span>
              Connecting...
            </>
          )
          : (
            "Connect"
          )}
      </button>
    </form>
  );
}

export default BunkerUrlInput;
