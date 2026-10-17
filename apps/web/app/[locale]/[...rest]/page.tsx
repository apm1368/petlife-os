import { notFound } from "next/navigation";

/** Any unmatched path under a locale renders the localized 404 instead of the framework default. */
export default function UnmatchedLocalePath() {
  notFound();
}
