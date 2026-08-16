# The XML tree

## File hierarchy

The TypePrompt parser takes all the input .xml files and concatenates their contents. It does not matter what file an XML element is defined in. This means you can freely rename files, move elements across files, without causing any change in the generated code.

## Top-level

Elements which can be defined at the top-level:
- `<meta>`
- `<template>`
- `<tool>`
- `<namespace>`

## The `<meta>` element (top-level)

When defined at the top level, `<meta>` allows you to specify the type of the metadata you can add to each template.
The text content must define a `Meta` type using TypePrompt's SDL language.

Example:

```xml
<meta>
  interface Meta {
    temperature: number;
    num_retries?: integer;
    // TODO: add more fields
  };
</meta>
```

It is an optional feature: if you don't define a top-level `<meta>` element, you cannot add metadata to your templates.

## The `<template>` element

A `<template>` defines a template for a prompt that will be sent to an LLM.

Attributes of `<template>` are:
| Attribute | Required? | Format | Description |
| --- | --- | --- | --- | --- |
| `name` | Required | UpperCamelCase identifier | Uniquely identifies this template within the namespace |
| `namespace` | Optional; defaults to `Main` | UpperCamelCase identifier | Must match the name of a declared `<namespace>` |

It can have the following child elements:
  - `<meta>`: metadata for this template; a value of type `Meta`
  - `<schema>`: input and output schema
  - `<tools>`: tools which can be called by the model
  - `<system>`: system instructions
  - `<user>`: user instructions
  - `<examples>`: few-shot examples
  - `<variant>`: one variant of the prompt
  - `<snippet>`: a piece of text which can be inserted into the system/user instructions

## The `<meta>` element (inside `<template>...</template>`)

The text content is the YAML representation of a value of type `Meta`. Must be present in each template definition if and only if there is a `<meta>` element defined at the top level.

Example:
```xml
<meta>
  interface Meta {
    temperature: number;
    num_retries?: integer;
  };
</meta>

<template name="Wave">
  <meta>
    temperature: 0.8
  </meta>

  ...
</template>
```

## The `<schema>` element

Required. The text content must define both an `Input` and an `Output` type using TypePrompt's SDL language.

The `<schema>` tag has an optional `output-format` attribute which can be either `text` or `json` and defaults to `json`. If it is `text`, the `Output` type must be `string`.

Example:

```xml
<template>
  <schema>
    interface Input {
      dateToday: string;
      ...
    };

    interface Output = {
      ...
    }
  </schema>

  ...
</template>
```

## The `<tools>` elements

Optional. Lets you register tools which can be called by the model for this prompt.

The text content must be the YAML representation of na array of `{tool: string}` objects. Example:

```xml`
<template>
  ...

  <tools>
    - name: getUserHistory
    - name: getTemperatureInLocation
  </tools>
</template>
```

Every tool name must match a `<tool>` defined at the top-level.

## The `<system>` and `<user>` elements

System and user instructions.

There must be exactly one `<system>` and one `<user>` element per template or template variant; see the section about template variants below.

In addition to text nodes, `<system>`/`<user>` can contain the following elements:
- `<insert>`
- `<enclosed>`
- `<c>`

### Indentation rules

TypePrompt has simple rules which allow you to indent the content of `<system>` and `<user>` so your XML file looks properly formatted.

If the first child is a text node with more than one line and the first line only contains whitespace characters, TypePrompt determines the base indentation with this logic: let P be the position of the first non-whitespace character if there is one, or the end position of the text node otherwise; the base indentation is the sequence of space and tab characters precending P.

TypePrompt trims the computed base indentation from the start of every line of every text node in the element. If a line is non-empty, it must start with base indentation or TypePrompt will report an error at compilation. Finally, leading empty lines are removed, and the last line is removed if it's empty.

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
The `format` attribute can be one of:
- `text`: default option. Requires the inserted value to be a string.
- `json`: pretty-printed JSON
- `toon`: see TODO
- `yaml`: TODO
- `csv`: TODO; explain that the inserted value must be an array of objects and each field of the object must be a string or an integer
- `tsv`: TODO; same requirement as `csv`

To insert a snippet of text (defined with `<snippet>`), use the `snippet` attribute, e.g. `<insert snippet="waveUser"/>`

### Indentation

If the line which contains the `<insert>` is indented, this indenting is added after every new line character in the formatted value or snippet at resolution.

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

When it wraps around an identifier, `<c>` allows you to check at compile-time that the identifier matches a name found in the template's schema, the template's registered tools, or any of the registered tools' schemas. The set of names for a schema are the field names and the string literal values.

Example:

```xml
<template name="AssembleName">
  <schema>
    interface Input {
      firstName: string;
      lastName: string;
    };

    interface Output {
      fullName: string;
    };
  </schema>

  <system>
    Assemble <c>firstName</c> and <c>lastName</c> into a full name, store the result in <c>fullName</c>.
  </system>

  <user>
    <insert val="input" format="json"/>
  </user>
</template>
```

If you rename `lastName` to `familyName` in the schema but not the instructions, you will get a compile-time error reminding you that your instructions are no longer in sync with your schema.

You can wrap the identifier inside double/single/backstick quotes within a `<c>` element: `<c>"firstName"</c>` is equivalent to `"<c>firstName</c>"`. Prefer the former form for readability.

The <c> element can also wrap around a JSON value. The compiler will check that the text content is well-formed JSON and that it complies to at least one named type defined in the schema or any of the registered tools's schemas. For example:

<system>
  Assemble <c>firstName</c> and <c>lastName</c> into a full name.

  Example:
    - input: <c>{"firstName": "John", "lastName": "Doe"}</c>
    - output: <c>{"fullName": "John Doe"}</c>
</system>

To keep examples short, you can The JSON wrapped inside `<c>...</c>` tags can contain an ellipsis (`...`) where:
  - another JSON value would be expected, e.g. `<c>["first", ...]</c>`
  - a sequence of key:value pairs would be expected, e.g. `<c>{"foo": "bar", ...}</c>`

## `<examples>`

Optional. Allows you to specify few-shot examples.

The text content is the YAML representation of an array of this type:
```ts
{
  input: Input;
  output: Input;

  /** If your example includes tool calls. */
  intermediateSteps?: {
    /** Tool calls made in parallel. */
    toolCalls: {
      callId: string;
      /** Name of a registered tool. */
      tool: string;
      input: ToolInput;
      output: ToolOutput;
    }[];
  }[];
}[]
```

Example:
```
<examples>
  - input:
      firstName: Jane
      lastName: Doe
    output:
      fullName: Jane Doe
  - input:
      firstName: John
      lastName: Doe
    output:
      fullName: John Doe
</examples>
```

There can be at most one `<examples>` element per template or template variant.

## `<variant>`

This element allows you to define different variants of your prompt. All variants share the same input and output type, but the instructions and few-shot examples can be different.

Using `<variant>` requires the `Input` type to have a `variant` field of type union of string literals. There must be one `<variant>` per member in the union.
When using variants, you can define `<meta>`, `<system>`, `<user>`, `<examples>` elements within `<variant>` elements instead of directly under `<template>`. You can choose for each tag, for example, in the same template you can choose to define `<meta>` under `<template>` and `<system>` under `<variant>`. In this case, there cannot be a `<meta>` under `<variant>`, and `<user>` cannot appear under `<template>`.

```xml
<template name="AssembleName">
  <schema>
    interface Input {
      firstName: string;
      lastName: string;
      variant: "formal" | "informal"
    }

    interface Output {
      fullName: string;
    }
  </schema>

  <user>
    <insert val="input.nameComponents" format="json"/>
  </user>

  <variant name="formal">
    <system>
      Assemble firstName and familyName into a full name.
    </system>

    <examples>
      - input:
          firstName: Jane
          lastName: Doe
        output:
          fullName: Jane Doe
    </examples>
  </variant>

  <variant name="informal">
    <system>
      Returns an informal `fullName` for the given person.
    </system>

    <examples>
      - input:
          firstName: Jane
          lastName: Doe
        output:
          fullName: J. Doe
    </examples>
  </variant>
</template>
```

## `<snippet>`

A snippet of text which can be inserted into system instructions, user instructions or another `<snippet>`.

Example:

```xml
<snippet name="dateToday">
  The date today is <insert val="input.dateToday"/>.
</snippet>
```

A `<snippet>` element may contain the same nodes as a `<system>` or `<user>` element. The same dedentation rules apply; for example in the example above, the snippet's resolved text starts with **The date** not preceded by any whitespace.

### Conditional snippets

You can make the content of a snippet depend on the value of an expression. For this, set the `switch` attribute. It expects an expression which resolves to a possibly-nullable boolean or union of string literals. When `switch` is set, the content of the snippet must be split between different `<case when="...">` branches. All cases must be covered, and there is no default case.

Example:

```xml
<snippet name="timeOfDay" switch="input.timeOfDay.notEmpty">
  <case when="true">
    The time today is <insert val="input.timeOfDay"/>.
  </case>
  <case when="false"></case>
</snippet>

<snippet name="tellLeavesColor" switch="input.season">
  <case when="spring,summer">Leaves are green.</case>
  <case when="autumn">Leaves are orange.</case>
  <case when="winter">There are no leaves.</case>
</snippet>
```

## The `<namespace>` element

The `<namespace>` element serves 2 purposes:
  - organization: group together multiple templates which share common features
  - definition of common types: `<namespace>` allows you to define types which can be shared by multiple templates.

Example:

```xml
<namespace name="Events">
  interface Weather {
    temperatureCelcius: number;
    raining: boolean;
  };
</namespace>

<template name="PlanEvent" namespace="Events">
  <schema>
    interface Input {
      weather: shared.Weather;
      ...
    };

    type Output = { ... };
  </schema>

  ...
</template>
```
