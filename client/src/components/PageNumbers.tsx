import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pageButtons } from "@shared/listPaging";

/**
 * Numbered pages for a long list: previous, each page, next. Used at the
 * top and the bottom of the Memberships list (shared/listPaging.ts says
 * why).
 */
export function PageNumbers({
  page,
  totalPages,
  onPage,
  label,
}: {
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
  /** Names the control for screen readers, e.g. "Membership pages, top". */
  label: string;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label={label} className="flex flex-wrap items-center gap-1">
      <Button
        variant="outline" size="sm" className="h-8 w-8 p-0"
        aria-label="Previous page"
        onClick={() => onPage(page - 1)} disabled={page <= 1}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      {pageButtons(page, totalPages).map((b, i) =>
        b === "gap" ? (
          <span key={`gap-${i}`} className="px-1 text-muted-foreground" aria-hidden>…</span>
        ) : (
          <Button
            key={b}
            variant={b === page ? "default" : "outline"}
            size="sm"
            className="h-8 min-w-8 px-2"
            aria-label={`Page ${b}`}
            aria-current={b === page ? "page" : undefined}
            onClick={() => onPage(b)}
          >
            {b}
          </Button>
        ),
      )}
      <Button
        variant="outline" size="sm" className="h-8 w-8 p-0"
        aria-label="Next page"
        onClick={() => onPage(page + 1)} disabled={page >= totalPages}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </nav>
  );
}
