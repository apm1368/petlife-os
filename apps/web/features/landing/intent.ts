const KEY = "petlife-landing-intent";
const routes: Record<string, string> = {
  cookie: "pets",
  health: "pets/active",
  vet: "vet/find",
  care: "services",
  shop: "shop",
  grooming: "services",
  taxi: "services",
};
export function rememberLandingIntent(action: string) {
  try {
    if (Object.hasOwn(routes, action))
      sessionStorage.setItem(KEY, JSON.stringify({ action, pet: "cookie", at: Date.now() }));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* Auth still works without storage. */
  }
}
export function consumeLandingIntent(locale: string): string | null {
  try {
    const value = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    if (!value) return null;
    const intent = JSON.parse(value);
    if (
      !intent ||
      !Object.hasOwn(routes, intent.action) ||
      intent.pet !== "cookie" ||
      typeof intent.at !== "number" ||
      Date.now() - intent.at > 30 * 60 * 1000 ||
      intent.at > Date.now()
    )
      return null;
    // Cookie is landing demo identity, never an authorized application pet ID.
    return `/${locale === "fa" ? "fa" : "en"}/${routes[intent.action]}?landingPet=cookie&landingAction=${intent.action}`;
  } catch {
    return null;
  }
}
