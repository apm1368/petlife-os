/**
 * Stringified and inlined into <head> so the theme is applied before first
 * paint — reading localStorage in a useEffect would flash the wrong theme.
 */
export const themeInitScript = `
(function () {
  try {
    var stored = localStorage.getItem("petlife-theme");
    if (stored === "LIGHT" || stored === "DARK") {
      document.documentElement.setAttribute("data-theme", stored.toLowerCase());
    }
  } catch (e) {}
})();
`;
