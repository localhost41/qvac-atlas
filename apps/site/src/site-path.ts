/** Prefixes one absolute site-local path with Astro's validated deployment base. */
export function sitePath(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error("site path must be absolute and local");
  }
  const base = import.meta.env.BASE_URL.endsWith("/")
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  return path === "/" ? base : `${base}${path.slice(1)}`;
}
