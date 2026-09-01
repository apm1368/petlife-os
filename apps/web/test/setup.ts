import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// vitest.config.ts runs with globals: false, so @testing-library/react's own
// auto-cleanup detection (which looks for a global afterEach) never fires —
// without this, DOM from one component test leaks into the next.
afterEach(cleanup);

// jsdom doesn't implement <dialog>'s imperative API — the Dialog component
// (packages/ui/src/Dialog.tsx) calls showModal()/close() directly, so any
// test that actually opens one needs these stubbed.
if (typeof HTMLDialogElement !== "undefined") {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
  };
}
