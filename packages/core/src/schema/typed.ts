import type { Constraint, SyntheticType } from "../schema/schema-types.js";

export type Typed<T> = SyntheticType & {
  readonly typeIdentity?: {
    readonly type: T;
  };
};

export function typedString(constraint?: Constraint<string>): Typed<string> {
  return {
    kind: "primitive",
    primitive: {
      text: "string",
    },
    constraint,
  };
}

export function typedStringLiteral<const S extends string>(value: S): Typed<S> {
  return {
    kind: "string-literal",
    value,
  };
}

export function typedOptional<T>(innerType: Typed<T>): Typed<T | undefined> {
  return {
    kind: "optional",
    innerType: innerType,
  };
}

export function typedArray<E>(
  innerType: Typed<E>,
  constraint?: Constraint<readonly unknown[]>,
): Typed<ReadonlyArray<E>> {
  return {
    kind: "array",
    elementType: innerType,
    constraint,
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
    kind: "interface",
    fields: Object.fromEntries(
      Object.entries(fields as { readonly [name: string]: Typed<unknown> }).map(
        ([name, field]) => [
          name,
          {
            name: { text: name },
            type: field,
          },
        ],
      ),
    ),
  };
}

type NoInfer<T> = [T][T extends any ? 0 : never];
