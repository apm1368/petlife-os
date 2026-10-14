/** Personal records retain the immersive frame; shopping and service journeys have their own surface. */
export function memberSurface(pathname: string): "glass" | "service" {
  const path = pathname.replace(/^\/(fa|en)(?=\/|$)/, "");
  return /^\/(home|pets|profile|subscription|notifications|care-calendar|support)(\/|$)/.test(path) ? "glass" : "service";
}
