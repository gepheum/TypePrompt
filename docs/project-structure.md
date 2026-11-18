---
title: Project structure
description: How TypePrompt projects and .tp files are organized.
---

# Project structure

A TypePrompt project is a directory containing a `typeprompt.yaml` configuration file. The project's `.tp` files are those matching the `include` patterns in that file (usually `prompts/**/*.tp`). See [CLI and configuration](/cli#configuration) for all configuration options.

## File naming conventions

By convention, `.tp` files and directories within your prompts directory follow these rules:

| Element | Naming Convention | Single-Namespace Project | Multi-Namespace Project |
|---|---|---|---|
| `<template>` | `PascalCase.tp` | `prompts/MyTemplate.tp` | `prompts/MyNamespace/MyTemplate.tp` |
| `<tool>` | `lowerCamel.tp` | `prompts/myTool.tp` | `prompts/MyNamespace/myTool.tp` |
| `<meta>` | `meta.tp` | `prompts/meta.tp` | `prompts/meta.tp` |
| `<namespace>` | `shared.tp` | `prompts/shared.tp` | `prompts/MyNamespace/shared.tp` |
| `<playground>` | `TemplateName.play.tp` | `prompts/MyTemplate.play.tp` | `prompts/MyNamespace/MyTemplate.play.tp` |

See [template syntax](/reference) for each element.

## Single-namespace project layout

```
.
├── typeprompt.yaml
└── prompts/
    ├── meta.tp
    ├── shared.tp
    ├── Translate.tp
    ├── Translate.play.tp
    ├── TriageTicket.tp
    └── webSearch.tp
```

## Multi-namespace project layout

```
.
├── typeprompt.yaml
└── prompts/
    ├── meta.tp
    ├── Finance/
    │   ├── shared.tp
    │   ├── DetectAnomaly.tp
    │   └── SummarizeTransaction.tp
    └── Legal/
        ├── shared.tp
        ├── DraftNda.tp
        ├── DraftNda.play.tp
        └── SummarizeClause.tp
```

See the [`<namespace>`](/reference#the-namespace-element) element reference for how namespaces group templates and share types.
