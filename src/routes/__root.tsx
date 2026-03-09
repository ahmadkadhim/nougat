import { HeadContent, Scripts, createRootRouteWithContext } from "@tanstack/react-router";
import type { AuthSnapshot } from "../lib/auth-session";
import { getAuthSnapshot } from "../lib/auth-session";
import appCss from "../styles.css?url";

export const Route = createRootRouteWithContext<{
  auth: AuthSnapshot;
}>()({
  beforeLoad: async ({ location }) => ({
    auth: await getAuthSnapshot(location.pathname)
  }),
  head: () => ({
    meta: [
      {
        charSet: "utf-8"
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1"
      },
      {
        title: "Nougat"
      },
      {
        name: "description",
        content: "Nougat personal knowledge capture and X bookmark sync."
      }
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss
      }
    ]
  }),
  shellComponent: RootDocument
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
