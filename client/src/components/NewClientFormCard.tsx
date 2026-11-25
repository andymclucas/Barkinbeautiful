import { useState } from "react";
import { CheckCircle2, Dog, Loader2, Plus, Trash2, UserRound } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  NEW_CLIENT_FORM_MAX_DOGS,
  newClientFormProblems,
  type NewClientFormDog,
} from "@shared/newClientForm";

type DogRow = { name: string; breed: string; age: string; weight: string };
const emptyDog = (): DogRow => ({ name: "", breed: "", age: "", weight: "" });
const emptyForm = () => ({ firstName: "", lastName: "", phone: "", email: "", address: "", website: "" });

function toNumber(value: string): number | null {
  const n = Number(value.trim());
  return value.trim() === "" || !Number.isFinite(n) ? null : n;
}

/**
 * The New Client Form itself: client details and their dogs, nothing else.
 *
 * Andy, 25/11/2026: no membership, product or service can be chosen here.
 * Sending it creates the client and dogs (server/routers/newClientForm.ts)
 * so staff can ring them and book them in. Used on the public page and
 * inside the staff app, with the salon's brand colours from the theme.
 */
export function NewClientFormCard({ salonDisplayName, onDone }: { salonDisplayName: string; onDone?: () => void }) {
  const [form, setForm] = useState(emptyForm);
  const [dogs, setDogs] = useState<DogRow[]>([emptyDog()]);
  const [problems, setProblems] = useState<string[]>([]);
  const [sent, setSent] = useState(false);

  const submit = trpc.newClientForm.submit.useMutation({
    onSuccess: () => { setSent(true); onDone?.(); },
    onError: (error) => setProblems([error.message]),
  });

  const asDogs = (): NewClientFormDog[] => dogs.map((dog) => ({
    name: dog.name, breed: dog.breed, ageYears: toNumber(dog.age), weightKg: toNumber(dog.weight),
  }));

  const send = () => {
    const found = newClientFormProblems({ ...form, dogs: asDogs() });
    setProblems(found);
    if (found.length > 0) return;
    submit.mutate({ ...form, dogs: asDogs() });
  };

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-4 py-10 text-center" data-testid="new-client-form-done">
        <div className="rounded-full bg-primary/10 p-4"><CheckCircle2 className="h-10 w-10 text-primary" /></div>
        <h2 className="text-2xl font-bold">Thank you{form.firstName ? `, ${form.firstName.trim()}` : ""}!</h2>
        <p className="max-w-md text-muted-foreground">
          We&rsquo;ve got your details. Someone from {salonDisplayName} will be in touch soon to find a time that suits you.
        </p>
        <Button variant="outline" onClick={() => { setForm(emptyForm()); setDogs([emptyDog()]); setProblems([]); setSent(false); }}>
          Fill in another form
        </Button>
      </div>
    );
  }

  const field = (key: "firstName" | "lastName" | "phone" | "email", label: string, props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`ncf-${key}`}>{label}</Label>
      <Input id={`ncf-${key}`} value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} className="h-11" {...props} />
    </div>
  );

  return (
    <form className="grid gap-8" onSubmit={(e) => { e.preventDefault(); send(); }} noValidate>
      <section className="grid gap-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><UserRound className="h-5 w-5 text-primary" /> Your details</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("firstName", "First name", { autoComplete: "given-name" })}
          {field("lastName", "Last name", { autoComplete: "family-name" })}
          {field("phone", "Mobile number", { type: "tel", inputMode: "tel", autoComplete: "tel" })}
          {field("email", "Email address", { type: "email", inputMode: "email", autoComplete: "email" })}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ncf-address">Home or mailing address</Label>
          <Textarea id="ncf-address" rows={2} autoComplete="street-address" value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
        </div>
        {/* Hidden from people; a bot that fills it is ignored. */}
        <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true"
          className="absolute -left-[9999px] h-0 w-0 opacity-0"
          value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} />
      </section>

      <section className="grid gap-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Dog className="h-5 w-5 text-primary" /> Your dog{dogs.length > 1 ? "s" : ""}</h2>
        {dogs.map((dog, index) => (
          <div key={index} className="grid gap-4 rounded-2xl border bg-muted/30 p-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor={`ncf-dog-${index}-name`}>Dog&rsquo;s name</Label>
              <Input id={`ncf-dog-${index}-name`} className="h-11" value={dog.name}
                onChange={(e) => setDogs((d) => d.map((x, i) => (i === index ? { ...x, name: e.target.value } : x)))} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`ncf-dog-${index}-breed`}>Breed</Label>
              <Input id={`ncf-dog-${index}-breed`} className="h-11" placeholder="A best guess is fine" value={dog.breed}
                onChange={(e) => setDogs((d) => d.map((x, i) => (i === index ? { ...x, breed: e.target.value } : x)))} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`ncf-dog-${index}-age`}>Age (years)</Label>
              <Input id={`ncf-dog-${index}-age`} className="h-11" type="number" inputMode="decimal" min={0} max={30} step="0.5" value={dog.age}
                onChange={(e) => setDogs((d) => d.map((x, i) => (i === index ? { ...x, age: e.target.value } : x)))} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`ncf-dog-${index}-weight`}>Weight (kg)</Label>
              <Input id={`ncf-dog-${index}-weight`} className="h-11" type="number" inputMode="decimal" min={0} max={120} step="0.1" value={dog.weight}
                onChange={(e) => setDogs((d) => d.map((x, i) => (i === index ? { ...x, weight: e.target.value } : x)))} />
            </div>
            {dogs.length > 1 && (
              <Button type="button" variant="ghost" size="sm" className="justify-self-start text-muted-foreground sm:col-span-2"
                onClick={() => setDogs((d) => d.filter((_, i) => i !== index))}>
                <Trash2 className="mr-1.5 h-4 w-4" /> Remove this dog
              </Button>
            )}
          </div>
        ))}
        {dogs.length < NEW_CLIENT_FORM_MAX_DOGS && (
          <Button type="button" variant="outline" className="justify-self-start" onClick={() => setDogs((d) => [...d, emptyDog()])}>
            <Plus className="mr-1.5 h-4 w-4" /> Add another dog
          </Button>
        )}
      </section>

      {problems.length > 0 && (
        <ul role="alert" className="grid gap-1 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {problems.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}

      <div className="grid gap-3">
        <Button type="submit" size="lg" className="h-12 text-base" disabled={submit.isPending}>
          {submit.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…</> : "Send my details"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          {salonDisplayName} will only use these details to contact you about grooming.
        </p>
      </div>
    </form>
  );
}
