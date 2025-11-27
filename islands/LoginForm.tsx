import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import QRCodeDisplay from "../components/QRCodeDisplay.tsx";
import BunkerUrlInput from "../components/BunkerUrlInput.tsx";
import {
  generateNostrConnectUrl,
  submitBunkerUrl,
} from "../services/auth-stubs.ts";

/**
 * LoginForm island component that provides two authentication methods:
 * 1. Client-initiated: Display QR code with nostrconnect:// URL
 * 2. Signer-initiated: Accept bunker:// URL from user
 */
export default function LoginForm() {
  // AI-NOTE: nostrConnectUrl holds the generated nostrconnect:// URL for QR display
  const nostrConnectUrl = useSignal<string>("");

  // AI-NOTE: Track loading state for client-initiated flow
  const isGeneratingQr = useSignal<boolean>(false);

  // AI-NOTE: Track loading state for signer-initiated flow
  const isConnecting = useSignal<boolean>(false);

  // AI-NOTE: Error messages for user feedback
  const errorMessage = useSignal<string>("");

  // Generate nostrconnect:// URL on component mount for client-initiated flow
  useEffect(() => {
    const initializeClientFlow = async () => {
      isGeneratingQr.value = true;
      errorMessage.value = "";

      try {
        const url = await generateNostrConnectUrl();
        nostrConnectUrl.value = url;
      } catch (error) {
        errorMessage.value = error instanceof Error
          ? error.message
          : "Failed to generate connection URL";
      } finally {
        isGeneratingQr.value = false;
      }
    };

    initializeClientFlow();
  }, []);

  /**
   * Handle bunker URL submission for signer-initiated flow
   */
  const handleBunkerSubmit = async (bunkerUrl: string) => {
    isConnecting.value = true;
    errorMessage.value = "";

    try {
      await submitBunkerUrl(bunkerUrl);
      // AI-NOTE: On success, the service layer will handle session creation
      // and redirect to chat view. This is handled in the service layer.
    } catch (error) {
      errorMessage.value = error instanceof Error
        ? error.message
        : "Failed to connect with bunker URL";
      isConnecting.value = false;
    }
  };

  return (
    <div class="w-full">
      {/* Error message display */}
      {errorMessage.value && (
        <div class="alert alert-error mb-6">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="stroke-current shrink-0 h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>{errorMessage.value}</span>
        </div>
      )}

      {/* Side-by-side authentication methods */}
      <div class="flex flex-col md:flex-row gap-8">
        {/* Client-initiated flow: QR Code */}
        <div class="flex flex-col items-center col-1">
          <h2 class="text-xl font-semibold mb-4">Scan QR Code</h2>
          <p class="text-sm text-center mb-6 opacity-70">
            Use your Nostr signer app to scan this QR code and connect
          </p>

          {isGeneratingQr.value
            ? (
              <div class="flex justify-center items-center h-64">
                <span class="loading loading-spinner loading-lg"></span>
              </div>
            )
            : <QRCodeDisplay url={nostrConnectUrl.value} />}
        </div>

        {/* Divider for desktop view */}
        <div class="divider divider-vertical md:divider-horizontal">OR</div>

        {/* Signer-initiated flow: Bunker URL Input */}
        <div class="flex flex-col items-center">
          <h2 class="text-xl font-semibold mb-4">Enter Bunker URL</h2>
          <p class="text-sm text-center mb-6 opacity-70">
            Paste the bunker:// URL from your Nostr signer
          </p>

          <BunkerUrlInput
            onSubmit={handleBunkerSubmit}
            isLoading={isConnecting.value}
          />
        </div>
      </div>
    </div>
  );
}
