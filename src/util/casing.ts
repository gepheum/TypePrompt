type Name = {
  readonly name: string;
  readonly start: number;
  readonly end: number;
  readonly path?: string;
};

type Error = {
  readonly message: string;
  readonly start: number;
  readonly end: number;
  readonly path?: string;
};

export function checkNoAmbiguity(
  names: ReadonlyArray<Name>,
  options?: {
    readonly exactMatchIsConflict?: boolean;
  },
): ReadonlyArray<Error> {
  const firstByLowercase = new Map<string, Name>();
  const firstDuplicateAlreadyReported = new Set<string>();
  const errors: Error[] = [];
  const exactMatchIsConflict = options?.exactMatchIsConflict ?? false;

  for (const name of names) {
    const lowercase = name.name.toLowerCase();
    const first = firstByLowercase.get(lowercase);
    if (first === undefined) {
      firstByLowercase.set(lowercase, name);
      continue;
    }

    if (name.name === first.name) {
      if (!exactMatchIsConflict) {
        continue;
      }
      if (!firstDuplicateAlreadyReported.has(lowercase)) {
        errors.push({
          start: first.start,
          end: first.end,
          path: first.path,
          message: `Name '${name.name}' is duplicated`,
        });
        firstDuplicateAlreadyReported.add(lowercase);
      }
      errors.push({
        start: name.start,
        end: name.end,
        path: name.path,
        message: `Name '${name.name}' is duplicated`,
      });
      continue;
    }

    errors.push({
      start: name.start,
      end: name.end,
      path: name.path,
      message: `Name '${name.name}' conflicts with '${first.name}'`,
    });
  }

  return errors;
}
