// Run with: npm run copy-spec-types [-- --dry-run]
//
// For each supported language, copies the section defining the 'Spec' types
// from a generated file in tests/ (produced by tests/test.sh) to the
// corresponding hand-written runtime file, so the runtime files stay in sync
// with the spec types emitted by the code generators.
//
// Only the lines between the section's opening and closing lines are replaced,
// so each runtime file keeps its own (possibly reformatted) delimiters.
//
// The generated code is not formatted, so run tests/format-all.sh afterwards.
// With --dry-run, reports what would change without writing anything.
//
// For TypeScript, tests/typescript/src/runtime-logic.ts imports the spec types
// from packages/core/src/compiler/spec-types.ts, so that is the file updated.

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

/** Half-open range [start, end) of line indices. */
type LineRange = { readonly start: number; readonly end: number };

type Language = {
  readonly name: string;
  /** Relative to the tests/ directory. */
  readonly generatedFile: string;
  /** Relative to the tests/ directory. */
  readonly runtimeFile: string;
  /** Returns the range of lines to copy (or replace), or null if not found. */
  readonly findSection: (lines: readonly string[]) => LineRange | null;
  /** Section finder for the runtime file, if different from `findSection`. */
  readonly findRuntimeSection?: (lines: readonly string[]) => LineRange | null;
  /** Adapts the copied lines to the runtime file, if needed. */
  readonly transform?: (
    section: readonly string[],
    generated: readonly string[],
    runtime: readonly string[],
  ) => string[];
};

/**
 * Returns the lines strictly between the first line matching `open` and the
 * first subsequent line matching `close`.
 */
function between(
  open: RegExp,
  close: RegExp,
): (lines: readonly string[]) => LineRange | null {
  return (lines) => {
    const openIndex = lines.findIndex((l) => open.test(l));
    if (openIndex < 0) {
      return null;
    }
    const closeIndex = lines.findIndex(
      (l, i) => i > openIndex && close.test(l),
    );
    if (closeIndex < 0) {
      return null;
    }
    return { start: openIndex + 1, end: closeIndex };
  };
}

/**
 * Dart has no wrapper around the spec types: they are top-level declarations
 * prefixed with '_Spec_'. The section spans from the first such declaration to
 * the closing brace of the last one.
 */
function findDartSection(lines: readonly string[]): LineRange | null {
  const declaration =
    /^(?:(?:final|sealed|abstract|base|interface)\s+)*(?:class|enum|mixin)\s+_Spec_/;
  let first = -1;
  let last = -1;
  lines.forEach((l, i) => {
    if (declaration.test(l)) {
      if (first < 0) {
        first = i;
      }
      last = i;
    }
  });
  if (first < 0) {
    return null;
  }
  const closeIndex = lines.findIndex((l, i) => i >= last && /^\}/.test(l));
  if (closeIndex < 0) {
    return null;
  }
  return { start: first, end: closeIndex + 1 };
}

/**
 * Python: the body of `class _internal...:`, i.e. the indented lines up to the
 * next top-level statement or the end of the file. Trailing blank lines are
 * excluded.
 */
function findPythonSection(lines: readonly string[]): LineRange | null {
  const classIndex = lines.findIndex((l) =>
    /^class _internal\b.*:\s*$/.test(l),
  );
  if (classIndex < 0) {
    return null;
  }
  let end = lines.findIndex(
    (l, i) => i > classIndex && l.trim() !== "" && !/^\s/.test(l),
  );
  if (end < 0) {
    end = lines.length;
  }
  while (end > classIndex + 1 && lines[end - 1]!.trim() === "") {
    --end;
  }
  return { start: classIndex + 1, end };
}

/**
 * C++: the generated header lives in a project-specific root namespace (e.g.
 * `typeprompt_01`), which the spec section refers to (e.g.
 * `using ::typeprompt_01::ToJsonNode;`). Rewrite it to the root namespace of
 * the runtime file.
 */
function renameCppRootNamespace(
  section: readonly string[],
  generated: readonly string[],
  runtime: readonly string[],
): string[] {
  const rootNamespace = (lines: readonly string[]): string => {
    for (const line of lines) {
      const match = /^namespace (\w+) \{/.exec(line);
      if (match) {
        return match[1]!;
      }
    }
    throw new Error("root namespace not found");
  };
  const from = rootNamespace(generated);
  const to = rootNamespace(runtime);
  const pattern = new RegExp(`\\b${from}\\b`, "g");
  return section.map((l) => l.replace(pattern, to));
}

/** TypeScript: removes the indentation of the `namespace Spec { ... }` body. */
function dedentTypeScriptNamespace(section: readonly string[]): string[] {
  return section.map((l) => l.replace(/^ {2}/, ""));
}

const LANGUAGES: readonly Language[] = [
  {
    name: "cpp",
    generatedFile: "cpp/gen/prompts_01.gen.h",
    runtimeFile: "cpp/runtime_logic.h",
    findSection: between(
      /^namespace internal::spec \{\s*$/,
      /^\}\s*\/\/ namespace internal::spec\s*$/,
    ),
    transform: renameCppRootNamespace,
  },
  {
    name: "csharp",
    generatedFile: "csharp/Gen/Prompts01.cs",
    runtimeFile: "csharp/RuntimeLogic.cs",
    findSection: between(/^file static class Spec\s*$/, /^\}/),
  },
  {
    name: "dart",
    generatedFile: "dart/lib/gen/prompts_01.dart",
    runtimeFile: "dart/lib/runtime_logic.dart",
    findSection: findDartSection,
  },
  {
    name: "kotlin",
    generatedFile: "kotlin/src/main/kotlin/gen/Prompts01.kt",
    runtimeFile: "kotlin/src/main/kotlin/dev/typeprompt/RuntimeLogic.kt",
    findSection: between(/^internal object Spec \{\s*$/, /^\}/),
  },
  {
    name: "python",
    generatedFile: "python/gen/prompts_01.py",
    runtimeFile: "python/runtime_types.py",
    findSection: findPythonSection,
  },
  {
    name: "rust",
    generatedFile: "rust/src/gen/prompts_01.rs",
    runtimeFile: "rust/src/runtime_logic/runtime_logic.rs",
    findSection: between(/^mod spec \{\s*$/, /^\}\s*\/\/ mod spec\s*$/),
  },
  {
    name: "swift",
    generatedFile: "swift/Sources/TypePromptE2E/Gen/Prompts01.swift",
    runtimeFile: "swift/Sources/TypePromptE2E/RuntimeLogic.swift",
    findSection: between(
      /^\s*fileprivate enum Spec \{\s*$/,
      /^\s*\}\s*\/\/ enum Spec\s*$/,
    ),
  },
  {
    name: "typescript",
    generatedFile: "typescript/src/gen/prompts-01.ts",
    runtimeFile: "../packages/core/src/compiler/spec-types.ts",
    findSection: between(/^namespace Spec \{\s*$/, /^\}/),
    findRuntimeSection: between(
      /^\/\/ <generated:spec>\s*$/,
      /^\/\/ <\/generated:spec>\s*$/,
    ),
    transform: dedentTypeScriptNamespace,
  },
];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TESTS_DIR = path.join(__dirname, "../tests");

const dryRun = process.argv.includes("--dry-run");

function readLines(relPath: string): { lines: string[]; eol: string } {
  const fullPath = path.join(TESTS_DIR, relPath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(
      `${relPath} not found. Run tests/test.sh first to generate the code.`,
    );
  }
  const content = fs.readFileSync(fullPath, "utf8");
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  return { lines: content.split(/\r?\n/), eol };
}

let errors = 0;

for (const lang of LANGUAGES) {
  try {
    const generated = readLines(lang.generatedFile).lines;
    const sourceRange = lang.findSection(generated);
    if (!sourceRange) {
      throw new Error(`spec section not found in ${lang.generatedFile}`);
    }
    const runtime = readLines(lang.runtimeFile);
    const targetRange = (lang.findRuntimeSection ?? lang.findSection)(
      runtime.lines,
    );
    if (!targetRange) {
      throw new Error(`spec section not found in ${lang.runtimeFile}`);
    }
    let section = generated.slice(sourceRange.start, sourceRange.end);
    if (lang.transform) {
      section = lang.transform(section, generated, runtime.lines);
    }
    const current = runtime.lines.slice(targetRange.start, targetRange.end);
    if (section.join("\n") === current.join("\n")) {
      console.log(`${lang.name}: up to date`);
      continue;
    }
    if (dryRun) {
      console.log(
        `${lang.name}: would update ${lang.runtimeFile} (${current.length} -> ${section.length} lines)`,
      );
      continue;
    }
    const updated = [
      ...runtime.lines.slice(0, targetRange.start),
      ...section,
      ...runtime.lines.slice(targetRange.end),
    ];
    fs.writeFileSync(
      path.join(TESTS_DIR, lang.runtimeFile),
      updated.join(runtime.eol),
      "utf8",
    );
    console.log(
      `${lang.name}: updated ${lang.runtimeFile} (${current.length} -> ${section.length} lines)`,
    );
  } catch (e) {
    ++errors;
    console.error(`${lang.name}: ERROR: ${(e as Error).message}`);
  }
}

if (errors > 0) {
  process.exit(1);
}
