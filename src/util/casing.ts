import { TextSpan } from "./shared-types.js";

type Error<S> = {
  readonly span: S;
  readonly message: string;
};

export function checkNoAmbiguity<S extends TextSpan>(
  names: ReadonlyArray<S>,
  options: {
    readonly exactMatchIsConflict: boolean;
  },
): ReadonlyArray<Error<S>> {
  const firstByLowercase = new Map<string, S>();
  const firstDuplicateAlreadyReported = new Set<string>();
  const errors: Error<S>[] = [];
  const { exactMatchIsConflict } = options;

  for (const name of names) {
    const lowercase = name.text.toLowerCase();
    const first = firstByLowercase.get(lowercase);
    if (first === undefined) {
      firstByLowercase.set(lowercase, name);
      continue;
    }

    if (name.text === first.text) {
      if (!exactMatchIsConflict) {
        continue;
      }
      if (!firstDuplicateAlreadyReported.has(lowercase)) {
        errors.push({
          span: first,
          message: `Name '${name.text}' is duplicated`,
        });
        firstDuplicateAlreadyReported.add(lowercase);
      }
      errors.push({
        span: name,
        message: `Name '${name.text}' is duplicated`,
      });
      continue;
    }

    errors.push({
      span: name,
      message: `Name '${name.text}' conflicts with '${first.text}'`,
    });
  }

  return errors;
}
