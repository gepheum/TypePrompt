import type {
  Constraint,
  SyntheticInterface,
  SyntheticStringUnionValues,
  SyntheticType,
  Type,
  Typed,
} from "./schema-types.js";

export function typedAny<T = unknown>(
  type: Type | SyntheticType = { kind: "any" },
): Typed<T> {
  return { type };
}

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

export function typedNumber(constraint?: Constraint<number>): Typed<number> {
  return {
    type: {
      kind: "primitive",
      primitive: {
        text: "number",
      },
      constraint,
    },
  };
}

export function typedBoolean(): Typed<boolean> {
  return {
    type: {
      kind: "primitive",
      primitive: {
        text: "boolean",
      },
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

export function typedStringUnion<const S extends string = string>(
  values: SyntheticStringUnionValues,
): Typed<S> {
  return {
    type: {
      kind: "synthetic-union",
      members: {
        kind: "strings",
        values,
      },
    },
  };
}

export function typedSimpleStringUnion<const S extends string = string>(
  values: readonly S[],
): Typed<S> {
  return typedStringUnion(
    Object.fromEntries(
      values.map((v) => [
        v,
        {
          kind: "unquoted",
          unquotedName: { text: v },
        },
      ]),
    ),
  );
}

export function typedDiscriminatedUnion<T = unknown>(
  discriminator: string,
  members: {
    readonly [discriminant: string]: Typed<unknown, SyntheticInterface>;
  },
): Typed<T> {
  const memberKeys = Object.keys(members);
  return {
    type: {
      kind: "synthetic-union",
      members: {
        kind: "interfaces",
        discriminator,
        discriminants: {
          type: "string",
          values: memberKeys.map((key) => ({ value: key })),
        },
        members: Object.fromEntries(
          Object.entries(members).map(
            ([key, typed]) => [key, { resolved: typed.type }] as const,
          ),
        ),
      },
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
    : T,
  SyntheticInterface
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
