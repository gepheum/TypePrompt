// <static:dart-imports>
import 'dart:convert';
// </static:dart-imports>

// <static:dart-public-types>
final class ToolCall {
  final String callId;
  final String toolName;
  final String stringifiedInput;

  const ToolCall({
    required this.callId,
    required this.toolName,
    required this.stringifiedInput,
  });
}

final class ToolCallResponse {
  final String callId;
  final String stringifiedOutput;

  const ToolCallResponse({
    required this.callId,
    required this.stringifiedOutput,
  });
}
// </static:dart-public-types>

// <static:dart-logic>
// </static:dart-logic>

// <generated:spec>
final class _Spec_Templates {
  final int edition;
  final String signature;
  final Map<String, _Spec_Template> templates;
  final Map<String, _Spec_Tool> tools;
  final bool singleNamespace;

  /// The key is a relative path to a .xml file. The value is the file content.
  final Map<String, String> sourceFiles;

  _Spec_Templates({
    required this.edition,
    required this.signature,
    required this.templates,
    required this.tools,
    required this.singleNamespace,
    required this.sourceFiles,
  });

  Map<String, dynamic> toJson() {
    return {
      "edition": edition,
      "signature": signature,
      "templates": templates.map((k, v) => MapEntry(k, v.toJson())),
      "tools": tools.map((k, v) => MapEntry(k, v.toJson())),
      "singleNamespace": singleNamespace,
      "sourceFiles": sourceFiles.map((k, v) => MapEntry(k, v)),
    };
  }

  @override
  String toString() {
    return JsonEncoder.withIndent("  ").convert(toJson());
  }

  factory _Spec_Templates.fromJson(Map<String, dynamic> json) {
    return _Spec_Templates(
      edition: (json["edition"] as num).toInt(),
      signature: json["signature"],
      templates: json["templates"]
          .map((k, v) => MapEntry(k, _Spec_Template.fromJson(v))),
      tools: json["tools"].map((k, v) => MapEntry(k, _Spec_Tool.fromJson(v))),
      singleNamespace: json["singleNamespace"],
      sourceFiles: json["sourceFiles"].map((k, v) => MapEntry(k, v)),
    );
  }
}

final class _Spec_Template {
  final String name;
  final String namespace;
  final _Spec_OutputFormat outputFormat;
  final List<_Spec_TemplateTool> tools;
  final _Spec_TemplateContents contents;
  final Map<String, _Spec_Snippet> snippets;
  final dynamic? outputJsonSchema;

  _Spec_Template({
    required this.name,
    required this.namespace,
    required this.outputFormat,
    required this.tools,
    required this.contents,
    required this.snippets,
    this.outputJsonSchema,
  });

  Map<String, dynamic> toJson() {
    return {
      "name": name,
      "namespace": namespace,
      "outputFormat": outputFormat.toJson(),
      "tools": tools.map((e) => e.toJson()).toList(),
      "contents": contents.toJson(),
      "snippets": snippets.map((k, v) => MapEntry(k, v.toJson())),
      "outputJsonSchema": outputJsonSchema,
    };
  }

  @override
  String toString() {
    return JsonEncoder.withIndent("  ").convert(toJson());
  }

  factory _Spec_Template.fromJson(Map<String, dynamic> json) {
    return _Spec_Template(
      name: json["name"],
      namespace: json["namespace"],
      outputFormat: _Spec_OutputFormat.fromJson(json["outputFormat"]),
      tools: json["tools"].map(_Spec_TemplateTool.fromJson).toList(),
      contents: _Spec_TemplateContents.fromJson(json["contents"]),
      snippets: json["snippets"]
          .map((k, v) => MapEntry(k, _Spec_Snippet.fromJson(v))),
      outputJsonSchema: json["outputJsonSchema"],
    );
  }
}

enum _Spec_OutputFormat {
  json,
  text;

  String toJson() {
    switch (this) {
      case json:
        return "json";
      case text:
        return "text";
    }
  }

  factory _Spec_OutputFormat.fromJson(String value) {
    switch (value) {
      case "json":
        return _Spec_OutputFormat.json;
      case "text":
        return _Spec_OutputFormat.text;
      default:
        throw FormatException("Unknown json value: $value");
    }
  }
}

final class _Spec_TemplateTool {
  final String id;
  final String name;

  _Spec_TemplateTool({
    required this.id,
    required this.name,
  });

  Map<String, dynamic> toJson() {
    return {
      "id": id,
      "name": name,
    };
  }

  @override
  String toString() {
    return JsonEncoder.withIndent("  ").convert(toJson());
  }

  factory _Spec_TemplateTool.fromJson(Map<String, dynamic> json) {
    return _Spec_TemplateTool(
      id: json["id"],
      name: json["name"],
    );
  }
}

sealed class _Spec_TemplateContents {
  Map<String, dynamic> toJson();

  factory _Spec_TemplateContents.fromJson(Map<String, dynamic> json) {
    switch (json['kind']) {
      case "no-variants":
        return _Spec_TemplateContents_KindNoVariants.fromJson(json);
      case "variants":
        return _Spec_TemplateContents_KindVariants.fromJson(json);
      default:
        throw FormatException("Unknown discriminator: ${json['kind']}");
    }
  }
}

final class _Spec_TemplateContents_KindNoVariants
    implements _Spec_TemplateContents {
  final _Spec_TemplateContent content;

  _Spec_TemplateContents_KindNoVariants({
    required this.content,
  });

  @override
  Map<String, dynamic> toJson() {
    return {
      "kind": "no-variants",
      "content": content.toJson(),
    };
  }

  @override
  String toString() {
    return JsonEncoder.withIndent("  ").convert(toJson());
  }

  factory _Spec_TemplateContents_KindNoVariants.fromJson(
      Map<String, dynamic> json) {
    return _Spec_TemplateContents_KindNoVariants(
      content: _Spec_TemplateContent.fromJson(json["content"]),
    );
  }
}

final class _Spec_TemplateContents_KindVariants
    implements _Spec_TemplateContents {
  final Map<String, _Spec_TemplateContent> variants;
  final _Spec_TemplateContent defaultContent;

  _Spec_TemplateContents_KindVariants({
    required this.variants,
    required this.defaultContent,
  });

  @override
  Map<String, dynamic> toJson() {
    return {
      "kind": "variants",
      "variants": variants.map((k, v) => MapEntry(k, v.toJson())),
      "defaultContent": defaultContent.toJson(),
    };
  }

  @override
  String toString() {
    return JsonEncoder.withIndent("  ").convert(toJson());
  }

  factory _Spec_TemplateContents_KindVariants.fromJson(
      Map<String, dynamic> json) {
    return _Spec_TemplateContents_KindVariants(
      variants: json["variants"]
          .map((k, v) => MapEntry(k, _Spec_TemplateContent.fromJson(v))),
      defaultContent: _Spec_TemplateContent.fromJson(json["defaultContent"]),
    );
  }
}

final class _Spec_TemplateContent {
  final dynamic? meta;
  final List<_Spec_BodyPiece>? system;
  final List<_Spec_BodyPiece>? user;
  final List<_Spec_FewShotExample>? examples;

  _Spec_TemplateContent({
    this.meta,
    this.system,
    this.user,
    this.examples,
  });

  Map<String, dynamic> toJson() {
    return {
      "meta": meta,
      "system": system?.map((e) => e.toJson()).toList(),
      "user": user?.map((e) => e.toJson()).toList(),
      "examples": examples?.map((e) => e.toJson()).toList(),
    };
  }

  @override
  String toString() {
    return JsonEncoder.withIndent("  ").convert(toJson());
  }

  factory _Spec_TemplateContent.fromJson(Map<String, dynamic> json) {
    return _Spec_TemplateContent(
      meta: json["meta"],
      system: json["system"]?.map(_Spec_BodyPiece.fromJson).toList(),
      user: json["user"]?.map(_Spec_BodyPiece.fromJson).toList(),
      examples: json["examples"]?.map(_Spec_FewShotExample.fromJson).toList(),
    );
  }
}

final class _Spec_FewShotExample {
  final dynamic input;
  final dynamic output;
  final List<_Spec_FewShotExample_IntermediateSteps> intermediateSteps;

  _Spec_FewShotExample({
    required this.input,
    required this.output,
    required this.intermediateSteps,
  });

  Map<String, dynamic> toJson() {
    return {
      "input": input,
      "output": output,
      "intermediateSteps": intermediateSteps.map((e) => e.toJson()).toList(),
    };
  }

  @override
  String toString() {
    return JsonEncoder.withIndent("  ").convert(toJson());
  }

  factory _Spec_FewShotExample.fromJson(Map<String, dynamic> json) {
    return _Spec_FewShotExample(
      input: json["input"],
      output: json["output"],
      intermediateSteps: json["intermediateSteps"]
          .map(_Spec_FewShotExample_IntermediateSteps.fromJson)
          .toList(),
    );
  }
}

final class _Spec_FewShotExample_IntermediateSteps {
  final List<_Spec_ToolCallExample> toolCalls;

  _Spec_FewShotExample_IntermediateSteps({
    required this.toolCalls,
  });

  Map<String, dynamic> toJson() {
    return {
      "toolCalls": toolCalls.map((e) => e.toJson()).toList(),
    };
  }

  @override
  String toString() {
    return JsonEncoder.withIndent("  ").convert(toJson());
  }

  factory _Spec_FewShotExample_IntermediateSteps.fromJson(
      Map<String, dynamic> json) {
    return _Spec_FewShotExample_IntermediateSteps(
      toolCalls: json["toolCalls"].map(_Spec_ToolCallExample.fromJson).toList(),
    );
  }
}

final class _Spec_ToolCallExample {
  final String callId;
  final String toolId;
  final String toolName;
  final dynamic input;
  final dynamic output;

  _Spec_ToolCallExample({
    required this.callId,
    required this.toolId,
    required this.toolName,
    required this.input,
    required this.output,
  });

  Map<String, dynamic> toJson() {
    return {
      "callId": callId,
      "toolId": toolId,
      "toolName": toolName,
      "input": input,
      "output": output,
    };
  }

  @override
  String toString() {
    return JsonEncoder.withIndent("  ").convert(toJson());
  }

  factory _Spec_ToolCallExample.fromJson(Map<String, dynamic> json) {
    return _Spec_ToolCallExample(
      callId: json["callId"],
      toolId: json["toolId"],
      toolName: json["toolName"],
      input: json["input"],
      output: json["output"],
    );
  }
}

sealed class _Spec_BodyPiece {
  Map<String, dynamic> toJson();

  factory _Spec_BodyPiece.fromJson(Map<String, dynamic> json) {
    switch (json['kind']) {
      case "text":
        return _Spec_BodyPiece_KindText.fromJson(json);
      case "insert-val":
        return _Spec_BodyPiece_KindInsertVal.fromJson(json);
      case "insert-snippet":
        return _Spec_BodyPiece_KindInsertSnippet.fromJson(json);
      default:
        throw FormatException("Unknown discriminator: ${json['kind']}");
    }
  }
}

final class _Spec_BodyPiece_KindText implements _Spec_BodyPiece {
  final String text;

  _Spec_BodyPiece_KindText({
    required this.text,
  });

  @override
  Map<String, dynamic> toJson() {
    return {
      "kind": "text",
      "text": text,
    };
  }

  @override
  String toString() {
    return JsonEncoder.withIndent("  ").convert(toJson());
  }

  factory _Spec_BodyPiece_KindText.fromJson(Map<String, dynamic> json) {
    return _Spec_BodyPiece_KindText(
      text: json["text"],
    );
  }
}

final class _Spec_BodyPiece_KindInsertVal implements _Spec_BodyPiece {
  final _Spec_Expression val;
  final _Spec_InsertFormat format;
  final String indent;

  _Spec_BodyPiece_KindInsertVal({
    required this.val,
    required this.format,
    required this.indent,
  });

  @override
  Map<String, dynamic> toJson() {
    return {
      "kind": "insert-val",
      "val": val.toJson(),
      "format": format.toJson(),
      "indent": indent,
    };
  }

  @override
  String toString() {
    return JsonEncoder.withIndent("  ").convert(toJson());
  }

  factory _Spec_BodyPiece_KindInsertVal.fromJson(Map<String, dynamic> json) {
    return _Spec_BodyPiece_KindInsertVal(
      val: _Spec_Expression.fromJson(json["val"]),
      format: _Spec_InsertFormat.fromJson(json["format"]),
      indent: json["indent"],
    );
  }
}

final class _Spec_BodyPiece_KindInsertSnippet implements _Spec_BodyPiece {
  /// Snippet name.
  final String snippet;

  /// Only contains whitespace characters.
  final String indent;

  _Spec_BodyPiece_KindInsertSnippet({
    required this.snippet,
    required this.indent,
  });

  @override
  Map<String, dynamic> toJson() {
    return {
      "kind": "insert-snippet",
      "snippet": snippet,
      "indent": indent,
    };
  }

  @override
  String toString() {
    return JsonEncoder.withIndent("  ").convert(toJson());
  }

  factory _Spec_BodyPiece_KindInsertSnippet.fromJson(
      Map<String, dynamic> json) {
    return _Spec_BodyPiece_KindInsertSnippet(
      snippet: json["snippet"],
      indent: json["indent"],
    );
  }
}

enum _Spec_InsertFormat {
  text,
  json,
  yaml,
  toon,
  csv,
  tsv;

  String toJson() {
    switch (this) {
      case text:
        return "text";
      case json:
        return "json";
      case yaml:
        return "yaml";
      case toon:
        return "toon";
      case csv:
        return "csv";
      case tsv:
        return "tsv";
    }
  }

  factory _Spec_InsertFormat.fromJson(String value) {
    switch (value) {
      case "text":
        return _Spec_InsertFormat.text;
      case "json":
        return _Spec_InsertFormat.json;
      case "yaml":
        return _Spec_InsertFormat.yaml;
      case "toon":
        return _Spec_InsertFormat.toon;
      case "csv":
        return _Spec_InsertFormat.csv;
      case "tsv":
        return _Spec_InsertFormat.tsv;
      default:
        throw FormatException("Unknown json value: $value");
    }
  }
}

sealed class _Spec_Expression {
  Map<String, dynamic> toJson();

  factory _Spec_Expression.fromJson(Map<String, dynamic> json) {
    switch (json['kind']) {
      case "input":
        return _Spec_Expression_KindInput.fromJson(json);
      case "property":
        return _Spec_Expression_KindProperty.fromJson(json);
      default:
        throw FormatException("Unknown discriminator: ${json['kind']}");
    }
  }
}

final class _Spec_Expression_KindInput implements _Spec_Expression {
  _Spec_Expression_KindInput();

  @override
  Map<String, dynamic> toJson() {
    return {
      "kind": "input",
    };
  }

  @override
  String toString() {
    return JsonEncoder.withIndent("  ").convert(toJson());
  }

  factory _Spec_Expression_KindInput.fromJson(Map<String, dynamic> json) {
    return _Spec_Expression_KindInput();
  }
}

final class _Spec_Expression_KindProperty implements _Spec_Expression {
  final _Spec_Expression left;
  final String property;

  _Spec_Expression_KindProperty({
    required this.left,
    required this.property,
  });

  @override
  Map<String, dynamic> toJson() {
    return {
      "kind": "property",
      "left": left.toJson(),
      "property": property,
    };
  }

  @override
  String toString() {
    return JsonEncoder.withIndent("  ").convert(toJson());
  }

  factory _Spec_Expression_KindProperty.fromJson(Map<String, dynamic> json) {
    return _Spec_Expression_KindProperty(
      left: _Spec_Expression.fromJson(json["left"]),
      property: json["property"],
    );
  }
}

sealed class _Spec_Snippet {
  Map<String, dynamic> toJson();

  factory _Spec_Snippet.fromJson(Map<String, dynamic> json) {
    switch (json['kind']) {
      case "snippet":
        return _Spec_Snippet_KindSnippet.fromJson(json);
      case "snippet-if":
        return _Spec_Snippet_KindSnippetIf.fromJson(json);
      case "snippet-switch":
        return _Spec_Snippet_KindSnippetSwitch.fromJson(json);
      default:
        throw FormatException("Unknown discriminator: ${json['kind']}");
    }
  }
}

final class _Spec_Snippet_KindSnippet implements _Spec_Snippet {
  final List<_Spec_BodyPiece> body;

  _Spec_Snippet_KindSnippet({
    required this.body,
  });

  @override
  Map<String, dynamic> toJson() {
    return {
      "kind": "snippet",
      "body": body.map((e) => e.toJson()).toList(),
    };
  }

  @override
  String toString() {
    return JsonEncoder.withIndent("  ").convert(toJson());
  }

  factory _Spec_Snippet_KindSnippet.fromJson(Map<String, dynamic> json) {
    return _Spec_Snippet_KindSnippet(
      body: json["body"].map(_Spec_BodyPiece.fromJson).toList(),
    );
  }
}

final class _Spec_Snippet_KindSnippetIf implements _Spec_Snippet {
  final _Spec_Expression expression;
  final _Spec_Snippet_KindSnippetIf_Is is_;
  final List<_Spec_BodyPiece> then;
  final List<_Spec_BodyPiece> else_;

  _Spec_Snippet_KindSnippetIf({
    required this.expression,
    required this.is_,
    required this.then,
    required this.else_,
  });

  @override
  Map<String, dynamic> toJson() {
    return {
      "kind": "snippet-if",
      "expression": expression.toJson(),
      "is": is_.toJson(),
      "then": then.map((e) => e.toJson()).toList(),
      "else": else_.map((e) => e.toJson()).toList(),
    };
  }

  @override
  String toString() {
    return JsonEncoder.withIndent("  ").convert(toJson());
  }

  factory _Spec_Snippet_KindSnippetIf.fromJson(Map<String, dynamic> json) {
    return _Spec_Snippet_KindSnippetIf(
      expression: _Spec_Expression.fromJson(json["expression"]),
      is_: _Spec_Snippet_KindSnippetIf_Is.fromJson(json["is"]),
      then: json["then"].map(_Spec_BodyPiece.fromJson).toList(),
      else_: json["else"].map(_Spec_BodyPiece.fromJson).toList(),
    );
  }
}

enum _Spec_Snippet_KindSnippetIf_Is {
  notNull,
  notEmpty,
  true_;

  String toJson() {
    switch (this) {
      case notNull:
        return "not-null";
      case notEmpty:
        return "not-empty";
      case true_:
        return "true";
    }
  }

  factory _Spec_Snippet_KindSnippetIf_Is.fromJson(String value) {
    switch (value) {
      case "not-null":
        return _Spec_Snippet_KindSnippetIf_Is.notNull;
      case "not-empty":
        return _Spec_Snippet_KindSnippetIf_Is.notEmpty;
      case "true":
        return _Spec_Snippet_KindSnippetIf_Is.true_;
      default:
        throw FormatException("Unknown json value: $value");
    }
  }
}

final class _Spec_Snippet_KindSnippetSwitch implements _Spec_Snippet {
  final _Spec_Expression expression;
  final Map<String, List<_Spec_BodyPiece>> branches;

  _Spec_Snippet_KindSnippetSwitch({
    required this.expression,
    required this.branches,
  });

  @override
  Map<String, dynamic> toJson() {
    return {
      "kind": "snippet-switch",
      "expression": expression.toJson(),
      "branches": branches
          .map((k, v) => MapEntry(k, v.map((e) => e.toJson()).toList())),
    };
  }

  @override
  String toString() {
    return JsonEncoder.withIndent("  ").convert(toJson());
  }

  factory _Spec_Snippet_KindSnippetSwitch.fromJson(Map<String, dynamic> json) {
    return _Spec_Snippet_KindSnippetSwitch(
      expression: _Spec_Expression.fromJson(json["expression"]),
      branches: json["branches"]
          .map((k, v) => MapEntry(k, v.map(_Spec_BodyPiece.fromJson).toList())),
    );
  }
}

final class _Spec_Tool {
  final String id;
  final String name;
  final String description;
  final dynamic? outputJsonSchema;

  _Spec_Tool({
    required this.id,
    required this.name,
    required this.description,
    this.outputJsonSchema,
  });

  Map<String, dynamic> toJson() {
    return {
      "id": id,
      "name": name,
      "description": description,
      "outputJsonSchema": outputJsonSchema,
    };
  }

  @override
  String toString() {
    return JsonEncoder.withIndent("  ").convert(toJson());
  }

  factory _Spec_Tool.fromJson(Map<String, dynamic> json) {
    return _Spec_Tool(
      id: json["id"],
      name: json["name"],
      description: json["description"],
      outputJsonSchema: json["outputJsonSchema"],
    );
  }
}
// </generated:spec>

// To disable unused import warnings
void disableUnusedImportWarnings() {
  JsonEncoder.withIndent("  ").convert("foo");
}
