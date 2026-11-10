import { useRef, useState } from "react";
import { Plus, Pencil, Trash2, Tag, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { readableTextOn } from "@shared/readableTextOn";
import { isAlwaysWarningCode } from "@shared/petCodeWarnings";
import { InlineEmojiPicker } from "@/components/InlineEmojiPicker";

/**
 * The salon's pet-code vocabulary, managed here.
 *
 * Andy, 22/10/2026, asked for these to be addable, editable and
 * deletable from Pricing & Services. They had been free text imported
 * from MoeGo, with their meanings in a hardcoded file that said of
 * itself it would fall behind.
 *
 * Two things this screen has to be honest about, because codes are a
 * vocabulary rather than an authority:
 *
 * - **A code on a dog is a fact a groomer wrote.** Removing it from the
 *   list does not strip it from any dog — "DOG AGGRESSIVE" is not less
 *   true because somebody tidied the catalogue. The delete confirm says
 *   how many dogs still carry it.
 * - **Renaming rewrites every dog that has it**, because the text is
 *   the join. The editor says so before you save, with the count.
 */
type CodeRow = {
  id: number;
  code: string;
  description: string | null;
  colourHex: string | null;
  sortOrder: number;
  isActive: boolean;
  /** A Warning rather than a Code. Absent until migration 0164. */
  isWarning?: boolean | null;
  dogsUsing: number;
};

type FormState = { code: string; description: string; colourHex: string; isActive: boolean; isWarning: boolean };

/** The two kinds of entry. One list is shown at a time. */
type Category = "code" | "warning";

const EMPTY: FormState = { code: "", description: "", colourHex: "", isActive: true, isWarning: false };

export function PetCodeCatalogue() {
  const utils = trpc.useUtils();
  const list = trpc.petCodes.list.useQuery({});
  const rows = (list.data ?? []) as CodeRow[];
  const [editor, setEditor] = useState<{ record: CodeRow | null; form: FormState } | null>(null);
  /* Which of the two lists is on screen. Andy, 10/11/2026: "Split them
     into headers at the top under the Add Code button that are the two
     categories." They had been stacked, so 64 codes sat below 47
     warnings and took a long scroll to reach. */
  const [category, setCategory] = useState<Category>("code");
  const codeRef = useRef<HTMLInputElement>(null);
  /* Which emoji THIS salon already uses, so the picker opens on the
     ones its own board is written in rather than on a generic row. */
  const codesInUse = rows.map((r) => r.code);

  const refresh = () => utils.petCodes.list.invalidate();
  const create = trpc.petCodes.create.useMutation({
    onSuccess: (_result, input) => {
      toast.success(input.isWarning ? "Warning added" : "Code added");
      // Show the list the new entry landed in, so it is not added out of sight.
      setCategory(input.isWarning ? "warning" : "code");
      setEditor(null);
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.petCodes.update.useMutation({
    onSuccess: (r) => {
      toast.success(r.renamed && r.dogsUpdated > 0
        ? `Code updated, and renamed on ${r.dogsUpdated} dog${r.dogsUpdated === 1 ? "" : "s"}`
        : "Code updated");
      setEditor(null); refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = trpc.petCodes.delete.useMutation({
    onSuccess: (r) => {
      toast.success(r.dogsStillCarryingIt > 0
        ? `"${r.code}" removed from the list. ${r.dogsStillCarryingIt} dog${r.dogsStillCarryingIt === 1 ? " still carries" : "s still carry"} it.`
        : `"${r.code}" removed`);
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const open = (record?: CodeRow) => setEditor({
    record: record ?? null,
    form: record
      ? { code: record.code, description: record.description ?? "", colourHex: record.colourHex ?? "", isActive: record.isActive, isWarning: Boolean(record.isWarning) }
      // A new entry starts as whichever list is being looked at.
      : { ...EMPTY, isWarning: category === "warning" },
  });

  const renaming = Boolean(editor?.record && editor.form.code.trim() !== editor.record.code);

  // A code is a Warning when the catalogue says so, or when its own
  // wording makes it one (bites, aggression, muzzle) — those cannot be
  // switched off, see shared/petCodeWarnings.ts.
  const isWarningRow = (row: CodeRow) => Boolean(row.isWarning) || isAlwaysWarningCode(row.code);
  const warningRows = rows.filter(isWarningRow);
  const codeRows = rows.filter((row) => !isWarningRow(row));
  const alwaysWarning = isAlwaysWarningCode(editor?.form.code ?? "");

  const renderTable = (list: CodeRow[], warning: boolean) => (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-3">Code</th>
                <th className="p-3">Means</th>
                <th className="p-3 text-right">Dogs</th>
                <th className="p-3 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {list.map((row) => (
                <tr key={row.id} className="border-t" data-testid="pet-code-row">
                  <td className="p-3">
                    <span
                      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs ${
                        warning
                          ? "bg-red-600 font-black text-white ring-1 ring-red-800"
                          : `font-bold ${row.colourHex ? "" : "bg-muted"}`
                      } ${row.isActive ? "" : "opacity-50"}`}
                      // A Warning is always red — its own colour is ignored
                      // everywhere, so it is not shown here either.
                      style={!warning && row.colourHex ? { background: row.colourHex, color: readableTextOn(row.colourHex) } : undefined}
                    >
                      {row.code}
                    </span>
                    {!row.isActive && <span className="ml-2 text-[11px] text-muted-foreground">hidden</span>}
                  </td>
                  <td className="p-3 text-muted-foreground">{row.description || "—"}</td>
                  <td className="p-3 text-right tabular-nums text-muted-foreground">{row.dogsUsing || "—"}</td>
                  <td className="p-3">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => open(row)} aria-label={`Edit ${row.code}`}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="sm" aria-label={`Delete ${row.code}`}
                        onClick={() => {
                          const carried = row.dogsUsing > 0
                            ? `\n\n${row.dogsUsing} dog${row.dogsUsing === 1 ? "" : "s"} currently carry this code. They keep it — removing it here only stops it being offered.`
                            : "";
                          if (window.confirm(`Remove "${row.code}" from the list?${carried}`)) remove.mutate({ id: row.id });
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-600" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
  );

  return (
    <div className="space-y-3" data-testid="pet-code-catalogue">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          The badges beside a dog's name. A groomer can still type one that is not on this list —
          these give it a meaning and a colour everywhere it appears. A <strong>Warning</strong> is
          shown as a bright red badge, and in the red warning box, on every appointment and on the
          workflow board.
        </p>
        <Button onClick={() => open()} className="gap-2"><Plus className="h-4 w-4" /> Add code</Button>
      </div>

      {list.isLoading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Loading codes…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <Tag className="mx-auto h-7 w-7 text-muted-foreground" />
          <p className="mt-2 font-semibold">No pet codes yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Add the shorthand your groomers use, like "✂5f" or "SENSITIVE".</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Two lists, because they behave differently. A Warning is
              drawn as a bright red badge and raised in the red warning
              box on appointments and the workflow board; a Code is not.
              The headers switch between them rather than stacking them. */}
          <div role="tablist" aria-label="Pet code categories" className="grid grid-cols-2 gap-2">
            <button
              type="button"
              role="tab"
              id="pet-code-tab-codes"
              aria-selected={category === "code"}
              aria-controls="pet-code-panel"
              onClick={() => setCategory("code")}
              className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-bold transition-colors ${
                category === "code"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              <Tag className="h-4 w-4" aria-hidden /> Pet Codes
              <span className="font-normal tabular-nums opacity-80">{codeRows.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              id="pet-code-tab-warnings"
              // index.css paints every selected role="tab" in the brand
              // colour; this is what keeps the Warnings header red.
              data-tone="warning"
              aria-selected={category === "warning"}
              aria-controls="pet-code-panel"
              onClick={() => setCategory("warning")}
              className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-bold transition-colors ${
                category === "warning"
                  ? "border-red-700 bg-red-600 text-white"
                  : "border-red-200 bg-background text-red-700 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30"
              }`}
            >
              <AlertTriangle className="h-4 w-4" aria-hidden /> Warnings
              <span className="font-normal tabular-nums opacity-80">{warningRows.length}</span>
            </button>
          </div>
          {category === "warning" ? (
            <section
              role="tabpanel"
              id="pet-code-panel"
              aria-labelledby="pet-code-tab-warnings"
              data-testid="pet-code-section-warnings"
              className="space-y-2"
            >
              <p className="text-xs text-muted-foreground">
                Bright red on every appointment and on the workflow board.
              </p>
              {warningRows.length === 0 ? (
                <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                  No warnings yet. Add one, or edit a code and change its type to Warning.
                </p>
              ) : (
                renderTable(warningRows, true)
              )}
            </section>
          ) : (
            <section
              role="tabpanel"
              id="pet-code-panel"
              aria-labelledby="pet-code-tab-codes"
              data-testid="pet-code-section-codes"
              className="space-y-2"
            >
              <p className="text-xs text-muted-foreground">Clip, style and handling shorthand.</p>
              {codeRows.length === 0 ? (
                <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">No codes yet.</p>
              ) : (
                renderTable(codeRows, false)
              )}
            </section>
          )}
        </div>
      )}

      <Dialog open={Boolean(editor)} onOpenChange={(o) => !o && setEditor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editor?.record ? "Edit" : "Add"} {editor?.form.isWarning || alwaysWarning ? "warning" : "pet code"}</DialogTitle></DialogHeader>
          {editor && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="pet-code-type">Type</Label>
                {/* A plain select, as the rest of Pricing & Services uses. */}
                <select
                  id="pet-code-type"
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm disabled:opacity-60"
                  value={alwaysWarning || editor.form.isWarning ? "warning" : "code"}
                  disabled={alwaysWarning}
                  onChange={(e) => setEditor((c) => c && { ...c, form: { ...c.form, isWarning: e.target.value === "warning" } })}
                >
                  <option value="code">Pet Code</option>
                  <option value="warning">Warning</option>
                </select>
                <p className="text-xs text-muted-foreground">
                  {alwaysWarning
                    ? "Bites, aggression and muzzle codes are always warnings, and cannot be changed."
                    : "A Warning is shown as a bright red badge, and in the red warning box, on appointments and the workflow board."}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Code</Label>
                {/* The code itself is often an emoji here — 💊, 💥, 📢 and
                    fourteen others are live in the catalogue — so the picker
                    belongs on this field rather than on the description. */}
                <div className="flex flex-wrap items-start gap-2">
                  <Input
                    ref={codeRef}
                    className="flex-1"
                    value={editor.form.code}
                    onChange={(e) => setEditor((c) => c && { ...c, form: { ...c.form, code: e.target.value } })}
                    placeholder="SENSITIVE"
                  />
                  <InlineEmojiPicker
                    value={editor.form.code}
                    onChange={(code) => setEditor((c) => c && { ...c, form: { ...c.form, code } })}
                    inputRef={codeRef}
                    recentFrom={codesInUse}
                    label="Insert an emoji into the code"
                  />
                </div>
                {renaming && editor.record && editor.record.dogsUsing > 0 && (
                  <p className="text-xs font-medium text-amber-700 dark:text-amber-300" data-testid="rename-warning">
                    Renaming will update this code on {editor.record.dogsUsing} dog
                    {editor.record.dogsUsing === 1 ? "" : "s"}.
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>What it means</Label>
                <Input
                  value={editor.form.description}
                  onChange={(e) => setEditor((c) => c && { ...c, form: { ...c.form, description: e.target.value } })}
                  placeholder="Nervous — go slowly around the face"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Badge colour <span className="text-muted-foreground">(optional)</span></Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="color"
                    className="h-9 w-14 p-1"
                    value={editor.form.colourHex || "#64748b"}
                    onChange={(e) => setEditor((c) => c && { ...c, form: { ...c.form, colourHex: e.target.value } })}
                  />
                  {editor.form.colourHex && (
                    <Button variant="ghost" size="sm" onClick={() => setEditor((c) => c && { ...c, form: { ...c.form, colourHex: "" } })}>
                      Clear
                    </Button>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Offer this code</p>
                  <p className="text-xs text-muted-foreground">Turn off to retire it without removing it from dogs.</p>
                </div>
                <Switch
                  checked={editor.form.isActive}
                  onCheckedChange={(v) => setEditor((c) => c && { ...c, form: { ...c.form, isActive: v } })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditor(null)}>Cancel</Button>
            <Button
              disabled={!editor?.form.code.trim() || create.isPending || update.isPending}
              onClick={() => {
                if (!editor) return;
                const payload = {
                  code: editor.form.code.trim(),
                  description: editor.form.description.trim() || null,
                  colourHex: editor.form.colourHex || null,
                  isActive: editor.form.isActive,
                  // Saved as it is shown: an always-warning code is stored as one.
                  isWarning: editor.form.isWarning || isAlwaysWarningCode(editor.form.code),
                };
                if (editor.record) update.mutate({ id: editor.record.id, ...payload });
                else create.mutate(payload);
              }}
            >
              {editor?.record ? "Save" : editor?.form.isWarning || alwaysWarning ? "Add warning" : "Add code"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
