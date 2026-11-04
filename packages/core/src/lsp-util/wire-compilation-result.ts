import type {
  CompilationResult,
  Sample,
} from "../compiler/compiler-types.js";
import type { PlaygroundModel } from "../compiler/playground-model-types.js";
import type { InternalError } from "../util/shared-types.js";

/**
 * Container of compilation results across all active projects.
 *
 * Sent via LSP notification `typeprompt/compilationResult`. The `projects` object
 * contains all known project paths as keys. Only the project that just changed has
 * a non-null `WireCompilationResult`, allowing subscribers to maintain a complete map
 * of projects while minimizing IPC serialization overhead.
 */
export type WireCompilationResults = {
  readonly projects: { readonly [path: string]: WireCompilationResult | null };
};

/**
 * A lightweight, JSON-RPC-safe snapshot of `CompilationResult`.
 *
 * Contains no `Map` instances, circular references, or heavy syntax trees.
 * Ideal for LSP notifications sent to clients (VS Code, playground UI, etc.).
 */
export type WireCompilationResult = {
  readonly sourceFiles: { readonly [path: string]: WireSourceFile };
  readonly templates: { readonly [id: string]: WireTemplate };
  readonly tools: { readonly [id: string]: WireTool };
  readonly playgrounds: { readonly [id: string]: WirePlayground };
  readonly edition: number;
  readonly signature: string | undefined;
  readonly anyErrors: boolean;
  readonly finalErrors: { readonly [path: string]: readonly InternalError[] };
  readonly warnings: { readonly [path: string]: readonly InternalError[] };
  readonly timestampMillis: number;
};

export type WireSourceFile = {
  readonly path: string;
  readonly entity?: WireSourceFileEntity;
  readonly hasErrors: boolean;
};

export type WireSourceFileEntity =
  | {
      readonly kind: "template";
      readonly name: string;
      readonly namespace: string | null;
    }
  | {
      readonly kind: "tool";
      readonly name: string;
      readonly namespace: string | null;
    }
  | {
      readonly kind: "namespace";
      readonly name: string;
    }
  | {
      readonly kind: "meta";
    }
  | {
      readonly kind: "playground";
      readonly forTemplate: string;
      readonly namespace: string | null;
      readonly model?: unknown;
      readonly samples?: unknown;
    };

export type WireTemplate = {
  readonly id: string;
  readonly name: string;
  readonly namespace: string | null;
  readonly isValid: boolean;
  readonly sourcePath: string;
};

export type WireTool = {
  readonly id: string;
  readonly name: string;
  readonly namespace: string | null;
  readonly isValid: boolean;
};

export type WirePlayground = {
  readonly id: string;
  readonly forTemplate: string;
  readonly namespace: string | null;
  readonly isValid: boolean;
  readonly model?: PlaygroundModel | unknown;
  readonly samples?: readonly Sample[] | unknown;
};

/**
 * Converts an internal `CompilationResult` into a JSON-RPC-safe `WireCompilationResult`.
 */
export function toWireCompilationResult(
  result: CompilationResult,
): WireCompilationResult {
  const sourceFiles: { [path: string]: WireSourceFile } = {};
  for (const [path, sf] of Object.entries(result.sourceFiles)) {
    let entity: WireSourceFileEntity | undefined;
    if (sf.entity) {
      switch (sf.entity.kind) {
        case "template":
          entity = {
            kind: "template",
            name: sf.entity.name.text,
            namespace: sf.entity.namespace?.text ?? null,
          };
          break;
        case "tool":
          entity = {
            kind: "tool",
            name: sf.entity.name.text,
            namespace: sf.entity.namespace?.text ?? null,
          };
          break;
        case "namespace":
          entity = {
            kind: "namespace",
            name: sf.entity.name.text,
          };
          break;
        case "meta":
          entity = {
            kind: "meta",
          };
          break;
        case "playground":
          entity = {
            kind: "playground",
            forTemplate: sf.entity.for.text,
            namespace: sf.entity.namespace?.text ?? null,
            model: sf.entity.model,
            samples: sf.entity.samples,
          };
          break;
      }
    }
    const hasErrors = (result.finalErrors[path]?.length ?? 0) > 0;
    sourceFiles[path] = {
      path,
      entity,
      hasErrors,
    };
  }

  const templates: { [id: string]: WireTemplate } = {};
  for (const [id, t] of Object.entries(result.templates)) {
    if ("template" in t) {
      templates[id] = {
        id,
        name: t.template.name.text,
        namespace: t.template.namespace?.text ?? null,
        isValid: true,
        sourcePath: t.template.sourcePath,
      };
    } else {
      templates[id] = {
        id,
        name: id,
        namespace: null,
        isValid: false,
        sourcePath: "",
      };
    }
  }

  const tools: { [id: string]: WireTool } = {};
  for (const [id, t] of Object.entries(result.tools)) {
    tools[id] = {
      id,
      name: t.tool.name.text,
      namespace: t.tool.namespace?.text ?? null,
      isValid: t.kind === "tool",
    };
  }

  const playgrounds: { [id: string]: WirePlayground } = {};
  for (const [id, p] of Object.entries(result.playgrounds)) {
    if ("templateId" in p) {
      playgrounds[id] = {
        id,
        forTemplate: p.templateId,
        namespace: p.playground.namespace?.text ?? null,
        isValid: true,
        model: p.model,
        samples: p.samples,
      };
    } else {
      playgrounds[id] = {
        id,
        forTemplate: p.playground.for.text,
        namespace: p.playground.namespace?.text ?? null,
        isValid: false,
        model: p.playground.model,
        samples: p.playground.samples,
      };
    }
  }

  return {
    sourceFiles,
    templates,
    tools,
    playgrounds,
    edition: result.edition,
    signature: result.signature,
    anyErrors: result.anyErrors,
    finalErrors: result.finalErrors,
    warnings: result.warnings,
    timestampMillis: result.timestampMillis,
  };
}
