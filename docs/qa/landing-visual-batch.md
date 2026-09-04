# Landing visual batch — 2026-09-04

Inventory rechecked: 94 page routes. Preliminary source classifications: A 0, B 47, C 38, D 1, E 8. These are triage classifications, not completed visual review. Unavailable data is recorded separately from broken routing. Blog references are present; CMS-specific controls have only adjacent editorial/admin patterns.

Updated /fa and /en landing: discovery links now belong to the header, using a single desktop row and a scrollable second mobile/tablet row. The pet identity no longer overlaps navigation. Short mobile content panels have bounded scrolling so actions remain reachable. Existing Cookie assets, camera interaction, product destinations and local preview behavior are retained. No new assets.

Validation: six landing tests passed; production frontend build passed (includes TypeScript). Browser checked fa 375x812, en 768x1024 and en 1440x900. At 375px header bottom 140.8px, pet top 144px; at 768px header bottom 139.6px, pet top 152px; at 1440px header bottom 91.6px, pet top 114px. No header/pet overlap; tablet/desktop document width equals viewport width. Desktop and mobile screenshots inspected in browser.

Intentional deviation: spatial world follows the user's separate spatial landing brief; supplied product boards guide navigation, typography, surfaces and controls. This is not a claim of full screenshot parity. Auth is intentionally redirected in local preview and has not received a completed visual acceptance pass. Other domains remain listed in visual-inventory.md.
