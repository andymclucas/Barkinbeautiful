import { useState } from "react";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { prepareClientContact } from "@shared/clientProfileEdit";

export type PortalContact = { id: number; name: string; phone: string; relationship: string | null };
export type PortalContactDraft = { name: string; phone: string; relationship: string };

/**
 * "Other contacts" on the client's own portal (Lauren, 18/11/2026).
 *
 * Somebody else the salon may ring about the dogs. A client can add one,
 * correct one and remove one. Remove sits inside the edit form and asks
 * once before it goes, because it cannot be undone from here.
 *
 * Plain props and no tRPC, so it can be rendered in a test: the page
 * hands it the list and the three saves. Each resolves to true when it
 * went through, which is what closes the form.
 */
export function PortalContactsCard({ contacts, canAdd, saving, onAdd, onUpdate, onRemove }: {
  contacts: PortalContact[];
  /** False once the client holds as many as the portal allows. */
  canAdd: boolean;
  saving: boolean;
  onAdd: (draft: PortalContactDraft) => Promise<boolean>;
  onUpdate: (contactId: number, draft: PortalContactDraft) => Promise<boolean>;
  onRemove: (contactId: number) => Promise<boolean>;
}) {
  /** null = closed, "new" = adding, a number = correcting that contact. */
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [form, setForm] = useState<PortalContactDraft>({ name: "", phone: "", relationship: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  /** True once Remove has been pressed and is waiting for a yes. */
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const editedContact = typeof editing === "number" ? contacts.find((contact) => contact.id === editing) : undefined;

  const remove = async () => {
    if (typeof editing !== "number") return;
    if (await onRemove(editing)) setEditing(null);
  };

  const open = (target: PortalContact | "new") => {
    setErrors({});
    setConfirmingRemove(false);
    setForm(target === "new"
      ? { name: "", phone: "", relationship: "" }
      : { name: target.name, phone: target.phone, relationship: target.relationship ?? "" });
    setEditing(target === "new" ? "new" : target.id);
  };

  const field = (key: keyof PortalContactDraft) => ({
    value: form[key],
    onChange: (event: { target: { value: string } }) =>
      setForm((previous) => ({ ...previous, [key]: event.target.value })),
  });

  const submit = async () => {
    // The same rule the server applies, run here first so a slip is
    // pointed out beside the box it is in.
    // A number the salon entered that the client has not touched is not
    // judged, whatever its shape.
    const stored = typeof editing === "number" ? contacts.find((contact) => contact.id === editing)?.phone : undefined;
    const prepared = prepareClientContact(form, { storedPhone: stored });
    if (!prepared.ok) {
      setErrors(prepared.errors);
      return;
    }
    setErrors({});
    const saved = editing === "new" ? await onAdd(form) : editing !== null ? await onUpdate(editing, form) : false;
    if (saved) setEditing(null);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" /> Other contacts
        </CardTitle>
        {canAdd && <Button variant="outline" size="sm" onClick={() => open("new")}>Add a contact</Button>}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          Someone else we can ring about your dog, such as a partner or whoever does the pick-up.
        </p>
        {contacts.length === 0 ? (
          <p className="font-medium">No other contacts yet.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {contacts.map((contact) => (
              <li key={contact.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="break-words font-medium">
                    {contact.name}
                    {contact.relationship ? <span className="font-normal text-muted-foreground"> ({contact.relationship})</span> : null}
                  </p>
                  <p className="text-muted-foreground">{contact.phone}</p>
                </div>
                <Button variant="ghost" size="sm" aria-label={`Edit ${contact.name}`} onClick={() => open(contact)}>Edit</Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={editing !== null} onOpenChange={(next) => { if (!next && !saving) setEditing(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing === "new" ? "Add a contact" : "Edit contact"}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="portal-contact-name">Their name</Label>
              <Input id="portal-contact-name" autoComplete="off" aria-invalid={Boolean(errors.name)} {...field("name")} />
              {errors.name && <p role="alert" className="text-xs text-destructive">{errors.name}</p>}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="portal-contact-phone">Their phone number</Label>
              <Input id="portal-contact-phone" inputMode="tel" autoComplete="off" placeholder="0412 345 678" aria-invalid={Boolean(errors.phone)} {...field("phone")} />
              {errors.phone && <p role="alert" className="text-xs text-destructive">{errors.phone}</p>}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="portal-contact-relationship">Who they are to you (optional)</Label>
              <Input id="portal-contact-relationship" autoComplete="off" placeholder="Partner, daughter, neighbour" aria-invalid={Boolean(errors.relationship)} {...field("relationship")} />
              {errors.relationship && <p role="alert" className="text-xs text-destructive">{errors.relationship}</p>}
            </div>
          </div>
          {confirmingRemove ? (
            <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <p className="font-medium">Remove {editedContact?.name ?? "this contact"}?</p>
              <p className="mt-1 text-muted-foreground">
                We will no longer ring them about your dog, and they come off any upcoming bookings.
              </p>
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <Button variant="outline" size="sm" disabled={saving} onClick={() => setConfirmingRemove(false)}>Keep</Button>
                <Button variant="destructive" size="sm" disabled={saving} onClick={remove}>
                  {saving ? "Removing…" : "Yes, remove"}
                </Button>
              </div>
            </div>
          ) : (
            <DialogFooter className="sm:justify-between">
              {typeof editing === "number" ? (
                <Button variant="ghost" className="text-destructive hover:text-destructive" disabled={saving} onClick={() => setConfirmingRemove(true)}>
                  Remove contact
                </Button>
              ) : <span />}
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button variant="outline" disabled={saving} onClick={() => setEditing(null)}>Cancel</Button>
                <Button disabled={saving} onClick={submit}>{saving ? "Saving…" : "Save contact"}</Button>
              </div>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
