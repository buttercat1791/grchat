import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import type { UIMessage } from "@/features/chat/schemas/message-schema.ts";
import MessageList from "@/features/chat/components/MessageList.tsx";
import ChatInput from "@/features/chat/components/ChatInput.tsx";
import WelcomeMessage from "@/features/chat/components/WelcomeMessage.tsx";
import {
  MessageCollectionResponse,
  MessageResponse,
} from "../features/chat/schemas/api-schemas.ts";
import {
  fetchWithAuth,
  handleAuthError,
  isAuthError,
} from "../features/auth/client-auth-utils.ts";

export interface ChatInterfaceProps {
  userPubkey: string;
}

/**
 * Main chat interface island component
 *
 * Integrates with the backend API to:
 * - Load messages from the timeline on mount
 * - Subscribe to SSE stream for real-time updates
 * - Create messages via API POST requests
 */
export default function ChatInterface({ userPubkey }: ChatInterfaceProps) {
  const messages = useSignal<UIMessage[]>([]);

  // Listen for session status changes (session expiry, etc.)
  useEffect(() => {
    const eventSource = new EventSource("/api/auth/session/status");

    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);

        if (data.type === "session_expired") {
          console.warn(
            `[ChatInterface] Session expired: ${data.reason}`,
          );
          handleAuthError(data.reason || "Session expired");
          eventSource.close();
        }
      } catch (error) {
        console.error("[ChatInterface] Error parsing session status:", error);
      }
    };

    eventSource.onerror = (error) => {
      console.error("[ChatInterface] Session status SSE error:", error);
      // Don't check auth here - the messages SSE handler will catch it
      eventSource.close();
    };

    return () => eventSource.close();
  }, []);

  // Load messages on mount
  useEffect(() => {
    async function loadMessages() {
      try {
        const response = await fetchWithAuth("/api/chat/messages?limit=50");

        // Check for authentication errors
        if (isAuthError(response)) {
          handleAuthError("Session expired while loading messages");
          return;
        }

        if (response.ok) {
          const data: MessageCollectionResponse = await response.json();
          const uiMessages: UIMessage[] = data._embedded.messages.map(
            (m: MessageResponse) => ({
              event: m.event,
              isOwnMessage: m.event.pubkey === userPubkey,
            }),
          );
          messages.value = uiMessages;
        }
      } catch (error) {
        console.error("Failed to load messages:", error);
      }
    }
    loadMessages();
  }, []);

  // Subscribe to SSE stream for real-time updates
  useEffect(() => {
    const eventSource = new EventSource("/api/chat/messages/stream");

    eventSource.onmessage = (e) => {
      const data = JSON.parse(e.data);
      const uiMessage: UIMessage = {
        event: data.event,
        isOwnMessage: data.event.pubkey === userPubkey,
      };
      messages.value = [...messages.value, uiMessage];
    };

    eventSource.onerror = async (error) => {
      console.error("SSE connection error:", error);

      // AI-NOTE: EventSource doesn't expose HTTP status codes, so we verify
      // the session by making a lightweight API call to check auth status
      try {
        const checkResponse = await fetchWithAuth("/api/chat/messages?limit=1");
        if (isAuthError(checkResponse)) {
          handleAuthError("Session expired - SSE connection lost");
          eventSource.close();
          return;
        }
      } catch {
        // Network error, not auth failure - log and let retry logic handle it
        console.warn(
          "SSE error may be network-related, not authentication failure",
        );
      }
    };

    return () => eventSource.close();
  }, []);

  // Send message
  const handleSendMessage = async (text: string) => {
    try {
      const response = await fetchWithAuth("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });

      // Check for authentication errors
      if (isAuthError(response)) {
        handleAuthError("Session expired while sending message");
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      // Message will be added via SSE stream
    } catch (error) {
      console.error("Send failed:", error);
      // AI-TODO: Show error to user via toast notification
    }
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
