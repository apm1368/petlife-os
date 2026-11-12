/** Guides are articles in this content category, served under /guides — a section of their own, not the blog. */
export const GUIDE_CATEGORY_SLUG = "guides";

/** Articles per index page. Server code (metadata, server-rendered lists) and the client view must agree; it lives here,
 * not in the "use client" view, because a server import of a client module's export is a client reference, not 12. */
export const ARTICLE_INDEX_PAGE_SIZE = 12;
