export function buildPetPhotoStorageKey(contentType: string, now: number, token: string): string {
  const subtype = contentType.split("/")[1]?.split(";")[0] ?? "jpg";
  const extension = subtype.replace(/[^a-z0-9]/gi, "") || "jpg";
  return `pet-photos/${now}-${token}.${extension}`;
}
