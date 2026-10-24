import { headers } from "next/headers";
import { isLocalPreviewHost } from "./local-preview";

/** Server-side twin of isLocalPreview(): explicit review build AND a loopback Host. False on every real deployment. */
export function isLocalPreviewRequest(): boolean {
  const host = headers().get("host") ?? "";
  const hostname = host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : (host.split(":")[0] ?? "");
  return isLocalPreviewHost(hostname, process.env.NEXT_PUBLIC_LOCAL_PREVIEW);
}
