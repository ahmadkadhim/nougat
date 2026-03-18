import { HeadContent, Scripts, createRootRouteWithContext } from "@tanstack/react-router";
import type { AuthSnapshot } from "../lib/auth-session";
import { getAuthSnapshot } from "../lib/auth-session";
import appleTouchIcon from "../assets/apple-touch-icon.png?url";
import favicon16 from "../assets/favicon-16.png?url";
import favicon32 from "../assets/favicon-32.png?url";
import { createRuntimeEnvBootScript } from "../lib/runtime-env";
import { createThemeBootScript } from "../lib/theme-config";
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
        content: "Nougat open-source capture inbox with note extraction and X bookmark sync."
      }
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss
      },
      {
        rel: "icon",
        type: "image/png",
        sizes: "16x16",
        href: favicon16
      },
      {
        rel: "icon",
        type: "image/png",
        sizes: "32x32",
        href: favicon32
      },
      {
        rel: "apple-touch-icon",
        sizes: "180x180",
        href: appleTouchIcon
      }
    ]
  }),
  shellComponent: RootDocument
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: createRuntimeEnvBootScript() }} />
        <script dangerouslySetInnerHTML={{ __html: createThemeBootScript() }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
