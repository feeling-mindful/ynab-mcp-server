import type { ReactNode } from "react";

export const metadata = {
  title: "YNAB MCP Server",
  description: "URL-based MCP server for YNAB",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
