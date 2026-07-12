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
  - `<help>`: optional documentation for this template
  - `<meta>`: metadata for this template; a value of type `Meta`
  - `<schema>`: input and output schema
  - `<system>`: system instructions
  - `<user>`: user instructions
  - `<examples>`: few-shot examples
  - `<variant>`: one variant of the prompt
  - `<snippet>`: a piece of text which can be inserted into the system/user instructions
  - `<let>`: alias for an expression

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

The `<schema>` tag has an optional `output-format` attribute which defaults to `json`. If the output format is not `json`, then the `Output` type must be the `string` type. Pre-defined values for `output-format` are `json` and `text`, but you can use any lowerCamelIdentifier: you will then need to write in your application the logic for handling this custom format.

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

### Indentation rules

Origamic has simple rules which allow you to indent the content of `<system>` and `<user>` so your XML file looks properly formatted.

If the first child is a text node with more than one line and the first line only contains whitespace characters, Origamic determines the base indentation with this logic: let P be the position of the first non-whitespace character if there is one, or the end position of the text node otherwise; the base indentation is the sequence of space and tab characters precending P.

Origamic trims the computed base indentation from the start of every line of every text node in the element. If a line is non-empty, it must start with base indentation or Origamic will report an error at compilation. Finally, leading and trailing empty lines are trimmed.

Example:

```xml
<template>
  ...

  <system>
    Hello
    world
      This is indented
  </system>
</template>
```

The resolved text:
```
Hello
world
  This is indented
```

## `<enclosed>`

The `enclosed` tag will be replaced with the tag name specified in the `tag` attribute in the resolve text.

Example:
```xml
<user>
  <enclosed tag="Article">
    Article content...
  </enclosed>
</user>
```

The resolved text:
```
<Article>
  Article content...
</Article>
```

This is more readable than escaping every `<` and `>` in the XML:
```xml
<!-- Same result, less readable. -->
<user>
  &lt;Article&gt;
    Article content...
  &lt;/Article&gt;
</user>
```

## `<insert>`

A placeholder which will be replaced with either a formatted value or a snippet of text at resolution.

To insert a value, use the `val` attribute, e.g. `<insert val="input.dateToday"/>`. The value is an expression of `input`.
The `format` attribute defaults to `text`, and `text` can only be used if the expression type is string. It means that if the expression has a complex type, you must set `format`. Pre-defined values are:
- `json`: pretty-printed JSON
- `toon`: 
- `csv`: ...
- `tsv`: ...

You can also define your own format TODO

To insert a snippet of text (defined with `<snippet>`), use the `snippet` attribute, e.g. `<insert snippet="waveUser"/>`

### Indentation

If the last multiline of the last text node preceding the `<insert>` element starts with a sequence of whitespace characters, this sequence is inserted after every new line character in the formatted value or snippet at resolution. 

Example:
```xml
<user>
  <enclosed tag="Article">
    <insert val="input.articleContent"/>
  </enclosed>
</user>
```

The resolved text is:
```
<Article>
  Article line 1
  Article line 2
  Article line 3
</Article>
```

## `<c>`

The `<c>` element allows you to check at compile-time that a name present in the instructions does refer to a field or string literal defined in the schema.

Consider this template:

```xml
<template name="AssembleName">
  <schema>
    type Input = {
      nameComponents: {
        firstName: string;
        lastName: string;
      };
    };

    type Output = {
      fullName: string;
    };
  </schema>

  <system>
    Assemble firstName and familyName into a full name.
  </system>

  <user>
    <insert val="input.nameComponents" format="json"/>
  </user>
</template>
```

There is an inconsistency between `familyName`, used in the system instructions, and `lastName`, used in the schema. Using `<c>` allows you to catch such inconsistency at compile time:
```xml
<system>
  Assemble <c>firstName</c> and <c>familyName</c> into a full name.
</system>
```

In this example, the compiler will raise an error because `familyName` is not defined in the schema.

The <c> element can also wrap around a JSON value. The compiler will check that the text content is well-formed JSON and that it complies to at least one named type defined in the schema. For example:

<system>
  Assemble <c>firstName</c> and <c>lastName</c> into a full name.

  Example:
    - input: <c>{"firstName": "John", "lastName": "Doe"}</c>
    - output: <c>{"full-name": "John Doe"}</c>
</system>

In this example, the compiler will raise an error because `{"full-name": "John Doe"}` does not comply to any named type defined in the schema: the output's field name is `fullName` and not `full-name`.

Origamic permits the usage of an ellipsis (`...`) in the JSON inside a `<c>` in 2 places:
  - where another JSON value would be expected, e.g. `<c>["first", ...]</c>`
  - where a sequence of key:value pairs would be expected, e.g. `<c>{"foo": "bar", ...}`

## `<examples>`

The `<examples>` element allows you to specify few-shot examples.

The text content is the JSON representation of a JSON array of type:
```ts
{
  help?: string;
  input: Input;
  output: Input;
}[]
```

Example:
```
<examples>
  [
    {
      "input": {
        "firstName": "Jane",
        "lastName": "Doe"
      },
      "output": {
        "fullName": "Jane Doe"
      }
    },
    {
      "input": {
        "firstName": "John",
        "lastName": "Doe"
      },
      "output": {
        "fullName": "John Doe"
      }
    }
  ]
</examples>
```

If the template has any `<variant>` element, then `<examples>` must be defined inside each `<variant>` as opposed to being defined directly inside `<template>`.

There can be at most one `<examples>` element per template or template variant.

## `<variant>`

This element allows you to define different variants of your prompt. All variants share the same input and output type, but the instructions and few-shot examples can be different.

Using `<variant>` requires the `Input` type to have a `variant` field of type union of string literals. There must be one `<variant>` per member in the union.
When using variants, the `<system>`, `<user>` and `<examples>` elements must be defined within each `<variant>` element as opposed to being direct children of the `<template>`.

```xml
<template name="AssembleName">
  <schema>
    type Input = {
      firstName: string;
      lastName: string;
      variant: "formal" | "informal"
    }

    type Output = {
      fullName: string;
    }
  </schema>

  <variant name="formal">
    <system>
      Assemble firstName and familyName into a full name.
    </system>

    <user>
      <insert val="input.nameComponents" format="json"/>
    </user>

    <examples>
      [
        {
          "input": {
            "nameComponents": {
              "firstName": "Jane",
              "lastName": "Doe"
            },
            "variant": "formal"
          },
          "output": {
            "fullName": "Jane Doe"
          }
        },
        {
          "input": {
            "nameComponents": {
              "firstName": "John",
              "lastName": "Doe"
            },
            "variant": "formal"
          },
          "output": {
            "fullName": "John Doe"
          }
        }
      ]
    </examples>
  </variant>

  <variant name="informal">
    <system>
      Returns an informal `fullName` for the given person.
    </system>

    <user>
      <insert val="input.nameComponents" format="json"/>
    </user>

    <examples>
      [
        {
          "input": {
            "nameComponents": {
              "firstName": "Jane",
              "lastName": "Doe"
            },
            "variant": "informal"
          },
          "output": {
            "fullName": "J. Do"
          }
        },
        {
          "input": {
            "nameComponents": {
              "firstName": "John",
              "lastName": "Doe"
            },
            "variant": "informal"
          },
          "output": {
            "fullName": "Johny D"
          }
        }
      ]
    </examples>
  </variant>
</template>
```

## `<snippet>`

