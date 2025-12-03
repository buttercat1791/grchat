import { defineConfig } from "vite";
import { fresh } from "@fresh/plugin-vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [fresh(), tailwindcss()],
  ssr: {
    external: [
      "@valkey/valkey-glide",
      "protobufjs",
      "@protobufjs/utf8",
      "@protobufjs/inquire",
    ],
  },
});
