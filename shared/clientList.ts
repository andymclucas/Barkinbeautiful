/**
 * How the client list is paged.
 *
 * Shared rather than local to the page because the bulk status cap in
 * shared/clientStatus.ts depends on it: ticking the header checkbox
 * selects a whole page, so a page bigger than the cap would build a
 * selection the server refuses outright and the change would fail as a
 * whole. The relationship is asserted in server/clientStatus.test.ts.
 */
export const CLIENT_LIST_PAGE_SIZES = [50, 100, 250, 500] as const;
export type ClientListPageSize = (typeof CLIENT_LIST_PAGE_SIZES)[number];

/** The biggest selection the header checkbox can build in one go. */
export const CLIENT_LIST_MAX_PAGE_SIZE = Math.max(...CLIENT_LIST_PAGE_SIZES);
