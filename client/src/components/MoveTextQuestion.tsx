import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Asked before a booking is moved to another day: text the client, or not.
 *
 * Lauren, 19/11/2026: she moved a booking at 6:40 am while planning the
 * day and the client was texted before she knew a text went at all. The
 * move itself is never in question here; closing the box cancels it.
 *
 * Neither answer is the default button on purpose. Plain props, so it can
 * be rendered in a test.
 */
export function MoveTextQuestion({ open, onAnswer }: {
  open: boolean;
  /** true: move and text. false: move, no text. null: do not move. */
  onAnswer: (answer: boolean | null) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onAnswer(null); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Text the client about the new day?</DialogTitle>
          <DialogDescription>
            This booking is moving to a different day. A text would tell the client the new day and time.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={() => onAnswer(null)}>Don&rsquo;t move it</Button>
          <span className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => onAnswer(false)}>Move, no text</Button>
            <Button variant="outline" onClick={() => onAnswer(true)}>Move and text</Button>
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
