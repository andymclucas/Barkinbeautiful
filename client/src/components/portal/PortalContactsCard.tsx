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
 * Somebody else the salon may ring about the dogs. A client can add one
 * and correct one; taking one off is the salon's, and the card says so
 * rather than leaving them looking for a button.
 *
 * Plain props and no tRPC, so it can be rendered in a test: the page
 * hands it the list and the two saves. `onAdd` and `onUpdate` resolve to
 * true when the save went through, which is what closes the form.
 */
export function PortalContactsCard({ contacts, canAdd, saving, onAdd, onUpdate }: {
  contacts: PortalContact[];
  /** False once the client holds as many as the portal allows. */
  canAdd: boolean;
  saving: boolean;
  onAdd: (draft: PortalContactDraft) => Promise<boolean>;
  onUpdate: (contactId: number, draft: PortalContactDraft) => Promise<boolean>;
}) {
  /** null = closed, "new" = adding, a number = correcting that contact. */
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [form, setForm] = useState<PortalContactDraft>({ name: "", phone: "", relationship: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const open = (target: PortalContact | "new") => {
    setErrors({});
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
        {contacts.length > 0 && (
          <p className="text-xs text-muted-foreground">To take a contact off, please ask the salon.</p>
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
          <DialogFooter>
            <Button variant="outline" disabled={saving} onClick={() => setEditing(null)}>Cancel</Button>
            <Button disabled={saving} onClick={submit}>{saving ? "Saving…" : "Save contact"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
