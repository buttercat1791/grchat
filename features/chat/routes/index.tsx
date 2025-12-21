import { Head } from "fresh/runtime";
import type { Context } from "fresh";
import type { State } from "@/utils.ts";
import ChatInterface from "@/islands/ChatInterface.tsx";

/**
 * Root page component - Chat UI
 *
 * AI-NOTE: This route is protected by access control middleware
 * ctx.state.auth.userPubkey is guaranteed to be non-null for authenticated
 * users
 */
function ChatPage({ userPubkey }: { userPubkey: string }) {
  return (
    <>
      <Head>
        <title>Chat - grchat</title>
      </Head>
      <ChatInterface userPubkey={userPubkey} />
    </>
  );
}

/**
 * Route handler for GET /
 *
 * AI-NOTE: Access control middleware ensures authentication before this
 * handler runs
 */
export async function chatHandler(
  ctx: Context<State>,
): Promise<Response> {
  // AI-NOTE: Middleware guarantees userPubkey is non-null for authenticated
  // users
  const userPubkey = ctx.state.auth.userPubkey!;

  return await ctx.render(<ChatPage userPubkey={userPubkey} />);
}
