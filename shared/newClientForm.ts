/**
 * The New Client Form: a one-page intake a new client fills in.
 *
 * Andy, 25/11/2026: "Build a client intake form that is a one pager ...
 * called 'New Client Form' ... that will then automatically load the new
 * client into the system. They just need the client details (first and last
 * name, phone number & email address, home address/mailing address), pets
 * name, breed, age and weight. They can't choose any membership or products
 * on this form. It's only the intake form so the staff can then reach out
 * to the person to try and book them in."
 *
 * Pure rules, so the page and the server check the same thing.
 */

/** Dogs one form can carry. A household with more rings the salon. */
export const NEW_CLIENT_FORM_MAX_DOGS = 6;

/** Recorded on the client so staff can see where the record came from. */
export const NEW_CLIENT_FORM_SOURCE = "New client form";

export type NewClientFormDog = {
  name: string;
  breed: string;
  /** Years, decimals allowed (0.5 = six months). Blank is allowed. */
  ageYears: number | null;
  /** Kilograms. Blank is allowed. */
  weightKg: number | null;
};

export type NewClientFormInput = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  address: string;
  dogs: NewClientFormDog[];
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Every problem with the form, in the order the fields appear. Empty when it can be sent. */
export function newClientFormProblems(input: NewClientFormInput): string[] {
  const problems: string[] = [];
  if (!input.firstName.trim()) problems.push("Please enter your first name.");
  if (!input.lastName.trim()) problems.push("Please enter your last name.");
  const digits = input.phone.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) problems.push("Please enter a phone number we can call you on.");
  if (!EMAIL.test(input.email.trim())) problems.push("Please enter your email address.");
  if (!input.address.trim()) problems.push("Please enter your home or mailing address.");

  const dogs = input.dogs.filter((dog) => dog.name.trim() || dog.breed.trim() || dog.ageYears != null || dog.weightKg != null);
  if (dogs.length === 0) problems.push("Please tell us about at least one dog.");
  if (dogs.length > NEW_CLIENT_FORM_MAX_DOGS) problems.push(`Please list up to ${NEW_CLIENT_FORM_MAX_DOGS} dogs, and call us about the rest.`);
  dogs.forEach((dog, index) => {
    const which = dogs.length > 1 ? `Dog ${index + 1}` : "Your dog";
    if (!dog.name.trim()) problems.push(`${which}: please enter a name.`);
    if (!dog.breed.trim()) problems.push(`${which}: please enter a breed (a best guess is fine).`);
    if (dog.ageYears != null && !(dog.ageYears >= 0 && dog.ageYears <= 30)) problems.push(`${which}: please check the age.`);
    if (dog.weightKg != null && !(dog.weightKg > 0 && dog.weightKg <= 120)) problems.push(`${which}: please check the weight.`);
  });
  return problems;
}

/** The dogs actually filled in, trimmed. */
export function filledDogs(dogs: NewClientFormDog[]): NewClientFormDog[] {
  return dogs
    .filter((dog) => dog.name.trim())
    .map((dog) => ({ ...dog, name: dog.name.trim(), breed: dog.breed.trim() }));
}

/**
 * A date of birth from an age in years, for pets.dateOfBirth.
 *
 * Approximate by nature: an owner says "about 3". Counted back in whole
 * months from today so 0.5 is six months, and pinned to the 1st, so the
 * record does not pretend to know the day.
 */
export function dateOfBirthFromAge(ageYears: number | null, now: Date): Date | null {
  if (ageYears == null || !Number.isFinite(ageYears) || ageYears < 0) return null;
  const months = Math.round(ageYears * 12);
  const birth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, 1));
  return birth;
}
