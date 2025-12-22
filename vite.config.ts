import { defineConfig } from "vite";
import { fresh } from "@fresh/plugin-vite";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  plugins: [fresh(), tailwindcss()],
  worker: {
    format: "es",
  },
  resolve: {
    alias: {
      // AI-NOTE: Bypass the problematic conditional require in redis-errors
      // by using our local shim that recreates the error classes
      "redis-errors": join(__dirname, "shared/utils/redis-errors-shim.ts"),
    },
  },
  ssr: {
    // AI-NOTE: Externalize iovalkey and all its dependencies to avoid
    // bundling issues with circular dependencies and module initialization
    // order. Let Deno's runtime handle module resolution completely.
    external: [
      "iovalkey",
      "cluster-key-slot",
      "denque",
      "lodash.defaults",
      "lodash.isarguments",
      "redis-parser",
      "standard-as-callback",
      "@iovalkey/commands",
    ],
  },
  build: {
    rollupOptions: {
      external: [
        "iovalkey",
        "cluster-key-slot",
        "denque",
        "lodash.defaults",
        "lodash.isarguments",
        "redis-parser",
        "standard-as-callback",
        "@iovalkey/commands",
      ],
    },
  },
  optimizeDeps: {
    // Exclude from pre-bundling to ensure runtime resolution
    exclude: ["iovalkey"],
  },
});
