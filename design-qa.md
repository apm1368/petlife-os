# Visual QA — shared motion batch

Date: 2026-09-03. Preview: http://localhost:3000/fa

Production frontend build passed and restarted from this checkout. Browser inspection: Persian admin article editor at 1265px and 375px; English editor at 375px; Persian landing at 1265px. Both mobile editor variants had no document horizontal overflow (scrollWidth 360, innerWidth 375). Locale direction correctly changed RTL/LTR. Editor remains visible alongside API error. Desktop preview sidebar and compact error recovery render correctly. Existing landing artwork and Cookie identity are preserved.

Reference comparison is incomplete: supplied images are multi-screen boards and the API cannot load the populated reference states. These checks establish responsive rendering, not pixel-perfect equivalence. Full page-by-page screenshot parity, dark-mode coverage, native reduced-motion browser coverage, and populated operational flows remain pending. Do not treat this file as a completed visual acceptance gate.

See docs/qa/visual-inventory.md and docs/qa/motion-implementation.md for the route inventory and implemented scope.
