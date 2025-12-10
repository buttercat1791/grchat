import type { PageProps } from "fresh";
import type { State } from "@/utils.ts";

export function AppLayout({ Component }: PageProps<unknown, State>) {
  return (
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>grchat</title>
      </head>
      <body>
        <Component />
      </body>
    </html>
  );
}
