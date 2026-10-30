import type { Constraint, Typed } from "./schema-types.js";

export function typedString(constraint?: Constraint<string>): Typed<string> {
  return {
    type: {
      kind: "primitive",
      primitive: {
        text: "string",
      },
      constraint,
    },
  };
}

export function typedStringLiteral<const S extends string>(value: S): Typed<S> {
  return {
    type: {
      kind: "string-literal",
      value,
    },
  };
}

export function typedOptional<T>(innerType: Typed<T>): Typed<T | undefined> {
  return {
    type: {
      kind: "optional",
      innerType: innerType.type,
    },
  };
}

export function typedArray<E>(
  innerType: Typed<E>,
  constraint?: Constraint<readonly unknown[]>,
): Typed<ReadonlyArray<E>> {
  return {
    type: {
      kind: "array",
      elementType: innerType.type,
      constraint,
    },
  };
}

export function typedInterface<
  T = never,
  Fields extends { readonly [name: string]: Typed<unknown> } = never,
>(
  fields: [T] extends [never]
    ? Fields
    : { readonly [K in keyof NoInfer<T>]-?: Typed<NoInfer<T>[K]> },
): Typed<
  [T] extends [never]
    ? {
        readonly [K in keyof Fields]: NonNullable<
          Fields[K]["typeIdentity"]
        >["type"];
      }
    : T
> {
  return {
    type: {
      kind: "interface",
      fields: Object.fromEntries(
        Object.entries(
          fields as { readonly [name: string]: Typed<unknown> },
        ).map(([name, field]) => [
          name,
          {
            name: { text: name },
            type: field.type,
          },
        ]),
      ),
    },
  };
}

type NoInfer<T> = [T][T extends any ? 0 : never];
