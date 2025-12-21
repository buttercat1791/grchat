import { useSignal } from "@preact/signals";
import type { Message } from "@/features/chat/schemas/message-schema.ts";
import MessageList from "@/features/chat/components/MessageList.tsx";
import ChatInput from "@/features/chat/components/ChatInput.tsx";
import WelcomeMessage from "@/features/chat/components/WelcomeMessage.tsx";

export interface ChatInterfaceProps {
  userPubkey: string;
}

/**
 * Main chat interface island component
 *
 * AI-NOTE: This is an island for interactivity (client-side state management)
 * Messages are stored in Preact signals, reset on page reload
 * No ID field in messages - backend will use Nostr event IDs
 */
export default function ChatInterface({ userPubkey }: ChatInterfaceProps) {
  const messages = useSignal<Message[]>([]);

  const handleSendMessage = (text: string) => {
    const newMessage: Message = {
      text,
      senderPubkey: userPubkey,
      timestamp: Date.now(),
      isOwnMessage: true,
    };

    messages.value = [...messages.value, newMessage];
  };

  return (
    <div class="flex flex-col h-screen max-h-screen">
      {/* Chat header */}
      <div class="bg-base-200 p-4 border-b border-base-300">
        <h1 class="text-2xl font-semibold">grchat</h1>
      </div>

      {/* Message area */}
      <div class="flex-1 overflow-hidden">
        {messages.value.length === 0
          ? <WelcomeMessage userPubkey={userPubkey} />
          : <MessageList messages={messages.value} />}
      </div>

      {/* Input area */}
      <ChatInput userPubkey={userPubkey} onSend={handleSendMessage} />
    </div>
  );
}
