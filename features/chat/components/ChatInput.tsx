import { useSignal } from "@preact/signals";
import PubkeyDisplay from "@/features/chat/components/PubkeyDisplay.tsx";

export interface ChatInputProps {
  userPubkey: string;
  onSend: (text: string) => void;
}

/**
 * Chat message input area with send button and pubkey display
 *
 * Supports sending via:
 * - Enter key (without Shift)
 * - Send button click
 */
export function ChatInput({ userPubkey, onSend }: ChatInputProps) {
  const messageText = useSignal<string>("");

  const handleSend = () => {
    const text = messageText.value.trim();
    if (!text) return;

    onSend(text);
    messageText.value = "";
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    // Send on Enter without Shift, allow Shift+Enter for newlines
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div class="border-t border-base-300 bg-base-100 p-4">
      <div class="flex items-center gap-2 mb-2">
        <span class="text-sm opacity-70">Sending as:</span>
        <PubkeyDisplay pubkey={userPubkey} />
      </div>

      <div class="flex gap-2">
        <textarea
          value={messageText.value}
          onInput={(e) =>
            messageText.value = (e.target as HTMLTextAreaElement).value}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          class="textarea textarea-bordered flex-1 resize-none"
          rows={3}
        />
        <button
          onClick={handleSend}
          disabled={!messageText.value.trim()}
          class="btn btn-primary"
          type="button"
        >
          Send
        </button>
      </div>

      <p class="text-xs opacity-50 mt-2">
        Press Enter to send, Shift+Enter for new line
      </p>
    </div>
  );
}

export default ChatInput;
