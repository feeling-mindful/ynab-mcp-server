/** @type {import('next').NextConfig} */
const nextConfig = {
  // tsconfig.json stays upstream's (CLI build); the app has its own.
  typescript: { tsconfigPath: "tsconfig.next.json" },
  experimental: {
    serverComponentsExternalPackages: ["ynab"],
  },
  webpack: (config) => {
    // Tool source files use NodeNext-style ".js" import specifiers that resolve to ".ts" sources.
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js", ".jsx"],
    };
    return config;
  },
};

export default nextConfig;
