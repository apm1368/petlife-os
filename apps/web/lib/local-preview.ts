/** Explicit review build + exact loopback host. Never grants an API identity. */
export function isLocalPreviewHost(hostname: string, enabled: string | undefined): boolean {
  return enabled === "1" && ["localhost", "127.0.0.1", "[::1]", "::1"].includes(hostname);
}

export function isLocalPreview(): boolean {
  return typeof window !== "undefined" &&
    isLocalPreviewHost(window.location.hostname, process.env.NEXT_PUBLIC_LOCAL_PREVIEW);
}
