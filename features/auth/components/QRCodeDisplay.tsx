import { useSignal } from "@preact/signals";
import encodeQR from "@paulmillr/qr";

export interface QRCodeDisplayProps {
  url: string;
}

/**
 * Displays a QR code for the given nostrconnect:// URL
 * Also provides the URL as copyable text
 *
 * AI-NOTE: Uses @paulmillr/qr which is SSR-compatible with zero dependencies
 */
export function QRCodeDisplay({ url }: QRCodeDisplayProps) {
  const copySuccess = useSignal<boolean>(false);

  /**
   * Copy the nostrconnect:// URL to clipboard
   */
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      copySuccess.value = true;
      setTimeout(() => {
        copySuccess.value = false;
      }, 2000);
    } catch (error) {
      console.error("Failed to copy URL:", error);
    }
  };

  if (!url) {
    return (
      <div class="flex justify-center items-center h-64">
        <p class="text-sm opacity-50">Generating connection URL...</p>
      </div>
    );
  }

  // Generate QR code as SVG string
  // AI-NOTE: This runs during SSR without issues - no dynamic imports needed
  const svgString = encodeQR(url, "svg", {
    border: 2,
    scale: 8,
  });

  return (
    <div class="flex flex-col items-center gap-4 w-full">
      {/* QR Code SVG */}
      {/* AI-TODO: Avoid use of `dangerouslySetInnerHTML */}
      <div
        class="bg-white p-4 rounded-lg shadow-md"
        dangerouslySetInnerHTML={{ __html: svgString }}
      />

      {/* Connection URL display */}
      <div class="w-full max-w-md">
        <div class="form-control">
          <label class="label">
            <span class="label-text text-xs">Connection URL</span>
          </label>
          <div class="join w-full">
            <input
              type="text"
              value={url}
              readonly
              class="input input-bordered input-sm join-item w-full font-mono text-xs"
            />
            <button
              onClick={handleCopy}
              class={`btn btn-sm join-item ${
                copySuccess.value ? "btn-success" : "btn-neutral"
              }`}
              type="button"
            >
              {copySuccess.value
                ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                )
                : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default QRCodeDisplay;
