type Name = {
  readonly name: string;
  readonly start: number;
  readonly end: number;
};

type Error = {
  readonly message: string;
  readonly start: number;
  readonly end: number;
};

export function checkNoAmbiguity(
  names: ReadonlyArray<Name>,
  options?: {
    readonly exactMatchIsConflict?: boolean;
  },
): ReadonlyArray<Error> {
  const firstByLowercase = new Map<string, string>();
  const errors: Error[] = [];
  const exactMatchIsConflict = options?.exactMatchIsConflict ?? false;

  for (const name of names) {
    const lowercase = name.name.toLowerCase();
    const first = firstByLowercase.get(lowercase);
    if (first === undefined) {
      firstByLowercase.set(lowercase, name.name);
      continue;
    }
    if (name.name !== first || exactMatchIsConflict) {
      errors.push({
        start: name.start,
        end: name.end,
        message: `Name '${name.name}' conflicts with '${first}'`,
      });
    }
  }

  return errors;
}
