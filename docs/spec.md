# The XML tree

## File hierarchy

The origamic parser takes all the input .xml files and concatenates their contents. It does not matter what file an XML element is defined in. This means you can freely rename files, move elements across files, without causing any change in the generated code.

## Top-level

Elements which can be defined at the top-level:
- `<meta>`
- `<template>`
- `<namespace>`

## The `<meta>` element (top-level)

When defined at the top level, the `<meta>` element takes no attribute. The text content must define a `Meta` type using Origamic's SDL language.

Example:

```xml
<meta>
  type Meta = {
    temperature: number;
    num_retries?: integer;
  };
</meta>
```

## The `<template>` element

A `<template>` defines a template for a prompt that will be sent to an LLM.

Attributes of `<template>` are:
| Attribute | Required? | Format | Description |
| --- | --- | --- | --- | --- |
| `name` | Required | UpperCamelCase identifier | Uniquely identifies this template within the namespace |
| `namespace` | Optional; defaults to `Default` | UpperCamelCase identifier | Must match the name of a declared `<namespace>` |

It can have the following child elements:
  - `<meta>`: metadata for this template; a value of type `Meta`
  - `<schema>`: input and output schema
  - `<system>`: system instructions
  - `<user>`: user instructions
  - `<examples>`: few shot examples
  - `<let>`: alias for an expression
  - `<variant>`: one variant of the prompt
  - `<snippet>`: a piece of text which can be inserted into the system/user instructions

## The `<meta>` element (inside `<template>...</template>`)

The text content is the JSON representation of a value of type `Meta`. Must be present in each template definition if and only if there is a `<meta>` element defined at the top level.

Example:
```xml
<meta>
  type Meta = {
    temperature: number;
    num_retries?: integer;
  };
</meta>

<template name="Wave">
  <meta>
    {
      "temperature": 0.8
    }
  </meta>

  ...
</template>
```

## The `<schema>` element

The text content must define both an `Input` and an `Output` type using Origamic's SDL language.

The `<schema>` tag has an optional `output-format` attribute which defaults to `json`. If the output format is not `json`, then the `Output` type must be the `string` type.

Every `<template>` must have exactly one `<schema>` element.

Example:

```xml
<template>
  <schema>
    type Input = {
      dateToday: string;
      ...
    };

    type Output = {
      ...
    }
  </schema>

  ...
</template>
```

## The `<system>` and `<user>` elements

System and user instructions.

If the template has any `<variant>` element, then `<system>` and `<user>` must be defined inside each `<variant>` as opposed to being defined directly inside `<template>`.

There must be exactly one `<system>` and one `<user>` element per template or template variant.

In addition to text nodes, `<system>`/`<user>` can contain the following elements:
- `<insert>`
- `<enclosed>`
- `<c>`

### Indentation
