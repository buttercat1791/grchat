import type { PageProps } from "fresh";
import type { State } from "@/utils.ts";
import { getAppConfig } from "@/features/config/index.ts";

export function AppLayout({ Component }: PageProps<unknown, State>) {
  const appConfig = getAppConfig();

  return (
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>grchat</title>
      </head>
      <body class="flex flex-col min-h-screen">
        <main class="flex-1">
          <Component />
        </main>
        <footer class="py-2 px-4">
          <div class="flex justify-end">
            <span class="text-xs text-base-content/50">
              v{appConfig.version}
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
