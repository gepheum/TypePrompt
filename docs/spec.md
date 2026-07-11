# Elements

## Templates

Templates are defined at the top-level with the `<template>` tag.

### Attributes

Attributes of `<template>` are:
| Attribute | Condition | Required? | Format | Description |
| --- | --- | --- | --- | --- |
| `name` | | Required | UpperCamelCase identifier | Uniquely identifies this template within the namespace |
| `namespace` | | Optional; defaults to `Default` | UpperCamelCase identifier | Must match the name of a declared `<namespace>` |

### Contents

A `<template>` element can have the following child elements:
  - `<meta>`
  - `<schema>`
  - `<system>`
  - `<user>`
  - `<examples>`
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
