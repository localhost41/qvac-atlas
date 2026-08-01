import { defineConfig } from "astro/config";

function deploymentBase(value = process.env.ATLAS_SITE_BASE ?? "/") {
  if (
    !value.startsWith("/") ||
    !value.endsWith("/") ||
    value.includes("//") ||
    value.includes("\\") ||
    value.includes("?") ||
    value.includes("#")
  ) {
    throw new Error("ATLAS_SITE_BASE must be an absolute trailing-slash path");
  }
  const segments = value.split("/").filter(Boolean);
  if (
    segments.some(
      (segment) =>
        segment === "." ||
        segment === ".." ||
        !/^[0-9A-Za-z._~-]+$/.test(segment),
    )
  ) {
    throw new Error("ATLAS_SITE_BASE contains an unsupported path segment");
  }
  return value;
}

export default defineConfig({
  base: deploymentBase(),
  output: "static",
  trailingSlash: "always",
  build: {
    inlineStylesheets: "never",
  },
});
