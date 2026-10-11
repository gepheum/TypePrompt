# TypePrompt schema definition language

TypePrompt uses a schema definition language (SDL) to describe the inputs and outputs of prompts and tools. The syntax is a subset of TypeScript with one addition: the `integer` primitive type.

---

## Table of contents

1. [Declarations](#declarations)
2. [Primitive types](#primitive-types)
3. [Any type](#any-type)
4. [Interfaces](#interfaces)
5. [Records](#records)
6. [Arrays](#arrays)
7. [Union types](#union-types)
8. [String literals](#string-literals)
9. [Recursive types](#recursive-types)
10. [Shared types](#shared-types)
11. [Naming rules](#naming-rules)
12. [Comments and JSDoc](#comments-and-jsdoc)

---

## Declarations

A schema file is a sequence of type declarations. Each declaration uses either the `type` alias form or the `interface` form:

```ts
type MyType = string | number;

interface Point {
  x: number;
  y: number;
}
```

Both forms are semantically equivalent — `interface Foo { ... }` is shorthand for `type Foo = { ... }`. Type names must start with an uppercase letter and contain only alphanumeric characters (`[A-Za-z0-9]`).

Declarations may be separated by semicolons or newlines; semicolons are optional after a closing brace `}`.

---

## Primitive types

| Keyword   | Meaning                                    |
|-----------|--------------------------------------------|
| `string`  | A UTF-16 string                            |
| `number`  | A 64-bit floating-point number             |
| `boolean` | `true` or `false`                          |
| `integer` | A 32-bit integer *(TypePrompt extension)*  |

`integer` is the only construct that does not exist in standard TypeScript.

---

## Any type

The keyword `any` is supported and maps to an unconstrained value:

```ts
type Payload = any;
```

---

## Interfaces

An interface is an ordered set of named fields enclosed in `{ }`.

```ts
type Person = {
  firstName: string;
  lastName: string;
  age?: integer;
};
```

Rules:
- Field names must start with a lowercase letter and contain only alphanumeric characters (`[a-z][A-Za-z0-9]*`).
- A field marked `?` is optional.
- Fields may be separated by `;`, `,`, or a newline.
- All field names within an interface must be case-insensitively unique.

---

## Records

A record maps arbitrary string keys to values of a single type:

```ts
type Scores = { [name: string]: number };
```

The key type must always be `string`; other key types (e.g. `number`) are not supported. The key name (`name` above) is only used as documentation; it does not affect runtime behavior.

---

## Arrays

Append `[]` to any type to produce a read-only array:

```ts
type Tags = string[];
type Matrix = number[][];
```

---

## Union types

Every union must be **homogeneous**: all members must be string literals, or all members must be interfaces. Mixing the two is an error.

### String-literal unions

```ts
type Color = "red" | "green" | "blue";
```

Each member must be a quoted string starting with a letter (see [String literals](#string-literals)).

### Interface unions (discriminated unions)

```ts
type Shape =
  | { kind: "circle"; radius: number }
  | { kind: "rectangle"; width: number; height: number };

type Result =
  | { success: true; value: string }
  | { success: false; error: string };
```

Rules:
- Every member interface must be non-empty.
- The **first field** of every member is the *discriminator field* and its type must be a string literal or a boolean literal (`true` / `false`).
- All members must share the **same discriminator field name** (e.g., all use `kind`).
- All members must use the **same discriminant type**: either all string literals or all boolean literals — mixing the two is an error.

### Flattening

A union member may itself be a named union type, in which case its members are flattened into the outer union:

```ts
type SuccessResult = { kind: "ok"; value: string };
type ErrorResult = { kind: "notFound" } | { kind: "forbidden" };
type Result = SuccessResult | ErrorResult;  // equivalent to three-member union
```

The same homogeneity and uniqueness rules apply to the flattened result. Circular union references are not allowed.

---

## String literals

Quoted string values used as types must start with a letter and contain only letters, digits, underscores, dashes or dots:

```ts
type Status = "pending" | "in-progress" | "done";
type Format = "application/json" | "text/plain";
```

- Must start with a letter (`[A-Za-z]`).
- Must only contain letters, digits, underscore, dash, dot or slash (`[A-Za-z0-9._/-]`).
- Both `"double"` and `'single'` quotes are accepted by the parser, but the value must satisfy the naming rule above.

---

## Recursive types

Recursive types are supported through discriminated unions. The **first member** of the union must be non-recursive (the base case); all subsequent members may reference the type being defined.

```ts
type Expr =
  | { kind: "number"; value: number }
  | { kind: "add"; left: Expr; right: Expr }
  | { kind: "if"; condition: Expr; then: Expr; else: Expr };
```

Circular references that do not go through a discriminated union boundary are not allowed.

---

## Shared types

Inside a **template** or **tool** schema, you may reference a type from the enclosing namespace schema by prefixing the type name with `shared.`:

```xml
<namespace name="Geo">
  type Address = {
    street: string;
    city: string;
    country: string;
  };
</namespace>

<template name="Greet" namespace="Geo">
  <schema>
    type Input = {
      recipient: shared.Address;
      message: string;
    };

    ...
  </schema>
</template>
```

`shared.TypeName` instructs the tooling to resolve `TypeName` in the namespace schema rather than in the current file. This is only valid inside template and tool schemas; using it in a namespace or meta schema is an error.

---

## Naming rules

| Context         | Pattern                    | Example         |
|-----------------|----------------------------|-----------------|
| Type names      | `[A-Z][A-Za-z0-9]*`        | `MyResponse`    |
| Field names     | `[a-z][A-Za-z0-9]*`        | `firstName`     |
| String literals | `[A-Za-z][A-Za-z0-9._/-]*` | `"application/json"` |
| Identifiers     | No leading digit, no `_`   | `myVar`         |

---

## Comments and JSDoc

Single-line (`//`) and block (`/* */`) comments are ignored by the parser. JSDoc comments (`/** */`) are preserved and attached to the type declaration or field that immediately follows them:

```ts
/** The user's full name. */
type Name = string;

type Person = {
  /** First name. */
  firstName: string;
  /** Last name. */
  lastName: string;
};
```

JSDoc text is stored in the JSON schemas that are passed to the LLM, and is also used by code generators to emit documentation in the target language.
