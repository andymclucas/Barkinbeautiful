export function formatSharedAppointmentName({
  petNames,
  surname,
}: {
  petNames: Array<string | null | undefined>;
  surname: string | null | undefined;
}): string {
  const names = petNames
    .map((name) => name?.trim())
    .filter((name): name is string => Boolean(name));
  const cleanSurname = surname?.trim();
  return [names.join(" & "), cleanSurname].filter(Boolean).join(" ");
}
