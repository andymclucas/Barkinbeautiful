import { useId } from "react";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";

/**
 * Breed, picked from the ones the salon already uses.
 *
 * Every breed field in the app was a bare text box, so "Cavoodle" was
 * retyped 1,278 times and a new spelling was one slip away. The list
 * comes from the dogs on file — 360 breeds, all of which arrived in the
 * MoeGo import — commonest first, so the suggestion is usually right
 * before anyone finishes the first syllable.
 *
 * Deliberately a `<datalist>` and NOT a select. A breed nobody has
 * brought in before must still be typeable: this salon sees crosses
 * constantly, and a picker that refuses "Groodle x Cavoodle" would send
 * staff to the notes field, which is worse than a long list. Free text
 * in, suggestions offered.
 *
 * It also degrades honestly: if the query has not landed, or a salon has
 * no dogs yet, it is exactly the text box it replaced.
 */
export function BreedInput({
  value,
  onChange,
  id,
  placeholder = "Breed",
  className,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  const listId = `breeds-${useId()}`;
  const { data: breeds } = trpc.pets.listBreeds.useQuery({}, {
    // The salon's breed list does not change minute to minute, and this
    // mounts on several screens.
    staleTime: 10 * 60 * 1000,
  });

  return (
    <>
      <Input
        id={id}
        list={listId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={className}
        disabled={disabled}
        autoComplete="off"
      />
      <datalist id={listId}>
        {(breeds ?? []).map((row) => (
          <option key={row.breed} value={row.breed} />
        ))}
      </datalist>
    </>
  );
}
