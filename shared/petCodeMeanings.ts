/**
 * What each MoeGo pet code actually means.
 *
 * A code has two parts in MoeGo: the badge a groomer sees on the card
 * ("Ner", "🦻", "PITA") and a description typed when the code was created
 * ("Nervous", "Deaf", "Difficult to groom"). Only the badge comes out in the
 * Pet list export, so importing that alone left the board showing "Ner" and
 * "Sen" — which mean nothing to anyone who was not there when they were
 * invented.
 *
 * Read from MoeGo Settings → Customers & Pets → Pet codes on 09/10/2026.
 * The salon adds codes as it needs them, so this WILL fall behind. That is
 * handled rather than fatal: an unknown badge simply shows as itself, which
 * is exactly what it did before. Re-read the settings page to refresh it.
 *
 * Deliberately a flat lookup and not a classification. Several codes are
 * safety-critical ("DOG AGGRESSIVE", "muzzle", "SEDATED", "CANNOT COMPLETE
 * SEND HOME") and several are the exact opposite of a neighbour ("PLUCK
 * EARS" / "DONT PLUCK EARS"), so nothing here decides what matters — it
 * only says what the shorthand stands for, and a human reads it.
 */

export const PET_CODE_MEANINGS: Readonly<Record<string, string>> = {
  "#3": "✂️#3",
  "✂4f": "#4f blade",
  "✂5f": "#5f blade",
  "#7f": "#7f",
  "10": "10 blade",
  "#15": "#15",
  "#3 PFFT": "#3 PFFT",
  "#4 PFFT": "#4 PFFT",
  "#5 PFFT": "#5 PFFT",
  "#7 PFFT": "#7 PFFT",
  "#7F Rev": "#7F Reverse",
  "#4 Rev": "#4 rev",
  "#10 Trad": "#10 Traditional",
  "10mm": "10mm comb",
  "#13mm": "#13mm Comb Attachment",
  "#16mm": "#16mm comb attachment",
  "#19mm": "#19mm comb attachment",
  "#22mm": "#22mm comb attachment",
  "#25 mm": "#25mm comb clip",
  "Style C": "Style Cut/ Traditional",
  "Bichon": "Bichon Style Groom",
  "Char Do": "Charlie do dogs",
  "Megs do": "Megs do dogs",
  "Ally do": "Ally Clients",
  "Brook do": "Brooke dog",
  "Loz do": "Loz dog's",
  "FileNail": "File Nails",
  "EX. CARE": "EXTRA DIFFICULT CHARGE",
  "H. Strip": "Hand Stripping",
  "TIE UP": "TIE TO TABLE",
  "OILY": "Oily coat extra wash",
  "no treat": "No treats",
  "QClean": "Quick Clean - Bath towel dry",
  "muzzle": "Muzzle",
  "PF": "poodle feet",
  "3W": "3 weekers",
  "No bows": "No bow ties/ hairbows",
  "ALL OFF": "All over body shave including ears -tail",
  "#15 Trad": "Traditional Schnauzer groom",
  "Smaller": "Smaller dog",
  "PITA": "Difficult to groom",
  "WARTS": "warts",
  "Bites": "Bites",
  "Noisy": "Noisy",
  "Lead ON": "Lead on at all times",
  "own Shampoo": "own Shampoo",
  "Bites For Feet/ Nails": "Bites For Feet/ Nails",
  "No crate": "No crate",
  "SEDATED": "SEDATED",
  "HIP DYSPLAYSIA": "HIP DYSPLAYSIA",
  "EPILEPSY": "EPILEPSY",
  "KEEP DOGS SEPARATE": "KEEP DOGS SEPARATE",
  "LEAD IN CAGE": "LEAD IN CAGE",
  "DONT PLUCK EARS": "DONT PLUCK EARS",
  "BAD LEGS": "BAD LEGS",
  "CANNOT COMPLETE SEND HOME": "CANNOT COMPLETE SEND HOME",
  "OLD and SORE": "OLD and SORE",
  "NO 10B GROIN/BUM": "NO 10B GROIN/BUM",
  "NO CAGE DRYING": "NO CAGE DRYING",
  "CAGE AGGRESSIVE": "CAGE AGGRESSIVE",
  "DONT SHAVE GROIN": "DONT SHAVE GROIN",
  "FREAKS @ DRYER": "FREAKS @ DRYER",
  "REAR DEW CLAWS": "REAR DEW CLAWS",
  "Lead On In Cage": "Lead On In Cage",
  "LEAD CHEWER": "LEAD CHEWER",
  "LEAVE EYELASHES": "LEAVE EYELASHES",
  "Difficult to Blowdry": "Difficult to Blowdry",
  "WARTS/ MOLES": "WARTS/ MOLES",
  "BAD SKIN": "BAD SKIN",
  "SENSITIVE": "SENSITIVE",
  "DOG AGGRESSIVE": "DOG AGGRESSIVE",
  "No cologne": "No cologne",
  "CANNOT COMPLETE GROOM": "CANNOT COMPLETE GROOM",
  "KEEP IN CRATE": "KEEP IN CRATE",
  "PLUCK EARS": "PLUCK EARS",
  "Dont shave groin / bum": "Dont shave groin / bum",
  "PREPAY": "Requires a pre-payment",
  "Deshed": "Deshed + Tidy",
  "Tidy": "face, feet, hygiene",
  "2W": "2 weekers",
  "4W": "4 weekers",
  "🚩": "Red flag",
  "💊": "Medication",
  "👅": "High energy",
  "🦿": "Arthritis",
  "🤯": "Angry",
  "🦷": "Tooth decay",
  "🧴": "Special shampoo",
  "💉": "Vaccine expired",
  "💦": "Pees",
  "💩": "Poops",
  "🦻": "Deaf",
  "💔": "Heart problems",
  "💥": "Aggressive",
  "📢": "Barker",
  "🕶️": "Blind",
  "🐘": "Heavy",
  "Too": "Tooth decay",
  "shy": "shy",
  "Ale": "Allergies",
  "Ene": "Energetic",
  "Bit": "Biter",
  "Mat": "Matted",
  "Ner": "Nervous",
  "Sen": "Senior pet",
  "Ski": "Skin sensitive",
  "Fri": "Friendly",
  "Ana": "Anal gland issue",
  "Art": "Arthritis",
  "Col": "Cologne",
  "Ear": "Ear infection",
};

/** What a code stands for, or null when the badge is already the meaning. */
export function petCodeMeaning(code: string): string | null {
  const meaning = PET_CODE_MEANINGS[code.trim()];
  if (!meaning) return null;
  // Most codes are their own description. Saying "SENSITIVE — SENSITIVE"
  // on a tooltip is noise, so only a genuine expansion comes back.
  return meaning.trim().toLowerCase() === code.trim().toLowerCase() ? null : meaning;
}

/** "Ner — Nervous", or just "Ner" when there is nothing to add. */
export function describePetCode(code: string): string {
  const meaning = petCodeMeaning(code);
  return meaning ? `${code} — ${meaning}` : code;
}
