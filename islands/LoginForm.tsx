import { useEffect } from "preact/hooks";
import { useSignal } from "@preact/signals";
import QRCodeDisplay from "@/features/auth/components/QRCodeDisplay.tsx";
import BunkerUrlInput from "@/features/auth/components/BunkerUrlInput.tsx";

/**
 * Generate a nostrconnect:// URL for client-initiated authentication flow
 *
 * This function:
 * - Calls the backend to generate a nostrconnect:// URL
 * - Returns the URL and connection ID for SSE monitoring
 *
 * @returns Promise resolving to { url: string, connectionId: string }
 * @throws Error if URL generation fails
 */
async function generateNostrConnectUrl(): Promise<
  { url: string; connectionId: string }
> {
  try {
    console.log("Fetching nostrconnect URL");
    // Call backend to generate nostrconnect URL
    const response = await fetch("/api/auth/nostrconnect", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to generate connection URL");
    }

    const { url, connectionId } = await response.json();

    return { url, connectionId };
  } catch (error) {
    console.error("Failed to generate nostrconnect URL:", error);
    throw error instanceof Error
      ? error
      : new Error("Failed to generate connection URL");
  }
}

/**
 * Listen for handshake completion using Server-Sent Events
 *
 * @param connectionId - The connection ID to monitor
 * @param onError - Callback for error handling
 * @returns EventSource instance
 */
function listenForHandshake(
  connectionId: string,
  onError: (error: string) => void,
): EventSource {
  const eventSource = new EventSource(
    `/api/auth/handshake/${connectionId}`,
  );

  eventSource.onmessage = async (event) => {
    try {
      const data = JSON.parse(event.data);

      if (data.status === "completed") {
        // Close the event source
        eventSource.close();

        // Call finalize endpoint to set auth cookie
        try {
          const finalizeResponse = await fetch("/api/auth/finalize", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ userPubkey: data.userPubkey }),
          });

          if (!finalizeResponse.ok) {
            const error = await finalizeResponse.json();
            onError(error.error || "Failed to finalize authentication");
            return;
          }

          // Redirect to chat view (index page)
          globalThis.location.href = "/";
        } catch (error) {
          console.error("Finalize request failed:", error);
          onError("Failed to finalize authentication");
        }
      } else if (data.status === "timeout") {
        console.error("Handshake timeout:", data.error);
        eventSource.close();
        onError(data.error || "Handshake timeout");
      } else if (data.status === "error") {
        console.error("Handshake error:", data.error);
        eventSource.close();
        onError(data.error || "Handshake failed");
      }
      // AI-NOTE: "pending" status is informational, no action needed
    } catch (error) {
      console.error("Error parsing SSE message:", error);
      eventSource.close();
      onError("Failed to process handshake response");
    }
  };

  eventSource.onerror = (error) => {
    console.error("SSE connection error:", error);
    eventSource.close();
    onError("Connection to server lost");
  };

  return eventSource;
}

/**
 * Submit a bunker:// URL for signer-initiated authentication flow
 *
 * This function:
 * - Validates the bunker:// URL format
 * - Calls the backend to complete the NIP-46 handshake
 * - Stores the user's public key in localStorage
 * - Redirects to the chat view
 *
 * @param bunkerUrl - The bunker:// URL provided by the user
 * @throws Error if the URL is invalid or the handshake fails
 */
async function submitBunkerUrl(bunkerUrl: string): Promise<void> {
  try {
    // Call backend to complete bunker handshake
    const response = await fetch("/api/auth/bunker", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ bunkerUrl }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to connect with bunker URL");
    }

    // Redirect to chat view (index page)
    // AI-NOTE: Cookie is already set by the /api/auth/bunker endpoint
    globalThis.location.href = "/";
  } catch (error) {
    console.error("Bunker URL submission failed:", error);
    throw error instanceof Error
      ? error
      : new Error("Failed to connect with bunker URL");
  }
}

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
    let eventSource: EventSource | null = null;

    const initializeClientFlow = async () => {
      isGeneratingQr.value = true;
      errorMessage.value = "";

      try {
        console.log("Initializing client auth flow");
        const { url, connectionId } = await generateNostrConnectUrl();
        nostrConnectUrl.value = url;

        // Start listening for handshake completion via SSE
        eventSource = listenForHandshake(connectionId, (error) => {
          errorMessage.value = error;
        });
      } catch (error) {
        errorMessage.value = error instanceof Error
          ? error.message
          : "Failed to generate connection URL";
      } finally {
        isGeneratingQr.value = false;
      }
    };

    initializeClientFlow();

    // Cleanup: close EventSource on component unmount
    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
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
