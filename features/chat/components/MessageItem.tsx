import type { Message } from "@/features/chat/schemas/message-schema.ts";
import { formatTimestamp } from "@/features/chat/utils/time-utils.ts";
import { abbreviatePubkey } from "@/features/chat/utils/pubkey-utils.ts";

export interface MessageItemProps {
  message: Message;
}

/**
 * Displays a single chat message
 *
 * AI-NOTE: Uses DaisyUI's chat component classes for proper message bubbles
 * Own messages align right, others align left
 */
export function MessageItem({ message }: MessageItemProps) {
  const chatClass = message.isOwnMessage ? "chat-end" : "chat-start";

  return (
    <div class={`chat ${chatClass}`}>
      <div class="chat-header text-xs opacity-70">
        {abbreviatePubkey(message.senderPubkey)}
        <time class="ml-2">{formatTimestamp(message.timestamp)}</time>
      </div>
      <div class="chat-bubble break-words whitespace-pre-wrap">
        {message.text}
      </div>
    </div>
  );
}

export default MessageItem;
