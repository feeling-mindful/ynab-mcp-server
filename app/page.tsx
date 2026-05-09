export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui", padding: "2rem", maxWidth: "640px" }}>
      <h1>YNAB MCP Server</h1>
      <p>
        URL-based Model Context Protocol server for YNAB. Connect your MCP
        client to <code>/mcp</code> with a Bearer token matching the configured
        API key.
      </p>
    </main>
  );
}
