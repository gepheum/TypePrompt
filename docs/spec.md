# The XML tree

## File hierarchy

The origamic parser takes all the input .xml files and concatenates their contents. It does not matter what file an XML element is defined in. This means you can freely rename files, move elements across files, without causing any change in the generated code.

## Top-level

Elements which can be defined at the top-level:
- `<meta>`
- `<template>`
- `<namespace>`

## The `<meta>` element (top-level)

When defined at the top level, the `<meta>` element takes no attribute.
It must only contain text content, and its content must define a `Meta` type in Origamic's SDL language.

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
  - `<let>`
  - `<variant>`
  - `<snippet>`

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

