import type { UIMessage } from "@/features/chat/schemas/message-schema.ts";
import { formatTimestamp } from "@/features/chat/utils/time-utils.ts";
import { abbreviatePubkey } from "@/features/chat/utils/pubkey-utils.ts";

export interface MessageItemProps {
  message: UIMessage;
}

/**
 * Displays a single chat message from a Nostr ChatMessage event.
 *
 * AI-NOTE: Uses DaisyUI's chat component classes for proper message bubbles.
 * Own messages align right, others align left.
 */
export function MessageItem({ message }: MessageItemProps) {
  const { event, isOwnMessage } = message;
  const chatClass = isOwnMessage ? "chat-end" : "chat-start";

  return (
    <div class={`chat ${chatClass}`}>
      <div class="chat-header text-xs opacity-70">
        {abbreviatePubkey(event.pubkey)}
        <time class="ml-2">{formatTimestamp(event.created_at * 1000)}</time>
      </div>
      <div class="chat-bubble break-words whitespace-pre-wrap">
        {event.content}
      </div>
    </div>
  );
}

export default MessageItem;
