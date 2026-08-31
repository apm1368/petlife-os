import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// vitest.config.ts runs with globals: false, so @testing-library/react's own
// auto-cleanup detection (which looks for a global afterEach) never fires —
// without this, DOM from one component test leaks into the next.
afterEach(cleanup);
