import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
const config: NextConfig = {
  outputFileTracingRoot: fileURLToPath(new URL(".", import.meta.url)),
  webpack(config) {
    config.cache = false;
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};
export default config;
