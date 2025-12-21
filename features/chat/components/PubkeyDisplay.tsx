import { useSignal } from "@preact/signals";
import {
  abbreviatePubkey,
  copyToClipboard,
} from "@/features/chat/utils/pubkey-utils.ts";

export interface PubkeyDisplayProps {
  pubkey: string;
}

/**
 * Displays an abbreviated public key with click-to-copy functionality
 *
 * AI-NOTE: Pattern follows QRCodeDisplay.tsx copy button implementation
 */
export function PubkeyDisplay({ pubkey }: PubkeyDisplayProps) {
  const copySuccess = useSignal<boolean>(false);

  const handleClick = async () => {
    try {
      await copyToClipboard(pubkey);
      copySuccess.value = true;
      setTimeout(() => {
        copySuccess.value = false;
      }, 2000);
    } catch (error) {
      console.error("Failed to copy pubkey:", error);
    }
  };

  return (
    <button
      onClick={handleClick}
      class={`btn btn-ghost btn-sm font-mono text-xs transition-colors ${
        copySuccess.value ? "btn-success" : ""
      }`}
      title="Click to copy full public key"
      type="button"
    >
      {copySuccess.value ? "Copied!" : abbreviatePubkey(pubkey)}
    </button>
  );
}

export default PubkeyDisplay;
