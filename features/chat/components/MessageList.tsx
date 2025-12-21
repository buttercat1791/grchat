import type { Message } from "@/features/chat/schemas/message-schema.ts";
import MessageItem from "@/features/chat/components/MessageItem.tsx";

export interface MessageListProps {
  messages: Message[];
}

/**
 * Displays a scrollable list of chat messages
 *
 * AI-NOTE: Uses message timestamp as key since messages have no ID field
 */
export function MessageList({ messages }: MessageListProps) {
  return (
    <div class="flex-1 overflow-y-auto px-4 py-2 space-y-2">
      {messages.map((message, index) => (
        <MessageItem
          key={`${message.timestamp}-${index}`}
          message={message}
        />
      ))}
    </div>
  );
}

export default MessageList;
