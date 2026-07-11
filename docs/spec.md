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

## The `<system>` and `<user>` elements

System and user instructions.

If the template has any `<variant>` element, then `<system>` and `<user>` must be defined inside each `<variant>` as opposed to being defined directly inside `<template>`.

There must be exactly one `<system>` and one `<user>` element per template/template variant.

In addition to text nodes, `<system>`/`<user>` can contain the following elements:
- `<insert>`
- `<enclosed>`
- `<c>`

### Indentation

## Namespaces

## Schema definitions

Schemas are defined with the `<schema>` tag.

Schemas can be defined:
  - in a `<template>`: there must be exactly one `<schema>` element
  - in a `<namespace>`: there can be at most one `<schema>` element

### Attributes

Attributes of `<schema>` are:
| Attribute | Condition | Required? | Format | Description |
| --- | --- | --- | --- | --- |
| `output-format` | Inside `<template>` | Optional; defaults to `json` | lowerCamelCase identifier such as `json`, `text` | Format of the LLM response.

### Contents

The `<schema>` element can only contain text nodes. The text content represents a set of type definitions in a specific format which is a subset of the TypeScript language.

If the `<schema>` is defined inside a `<template>`, both a type named `Input` and a type named `Output` must be defined.

TODO: define the actual format

## System and user instructions

# Elements

