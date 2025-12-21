export interface WelcomeMessageProps {
  userPubkey: string;
}

/**
 * Welcome message displayed when no chat messages exist
 */
export function WelcomeMessage({ userPubkey }: WelcomeMessageProps) {
  return (
    <div class="flex flex-col items-center justify-center h-full p-8 text-center">
      <h2 class="text-2xl font-semibold mb-4">Welcome to grchat!</h2>
      <p class="mb-2 opacity-70">No messages yet. Start a conversation!</p>
      <div class="mt-4 p-4 bg-base-200 rounded-lg">
        <p class="text-sm opacity-70 mb-2">Your public key:</p>
        <p class="font-mono text-xs break-all">{userPubkey}</p>
      </div>
    </div>
  );
}

export default WelcomeMessage;
