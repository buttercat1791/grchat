import { Head } from "fresh/runtime";
import { define } from "@/utils.ts";
import LoginForm from "@/islands/LoginForm.tsx";

export default define.page(function Login() {
  return (
    <div class="min-h-screen flex items-center justify-center bg-base-200">
      <Head>
        <title>Login - grchat</title>
      </Head>
      <div class="w-full max-w-4xl p-4">
        <div class="card bg-base-100 shadow-xl">
          <div class="card-body">
            <h1 class="card-title text-3xl mb-6 justify-center">
              grchat
            </h1>
            <p class="text-center mb-8">
              Connect your Nostr signer to begin chatting
            </p>
            <LoginForm />
          </div>
        </div>
      </div>
    </div>
  );
});
