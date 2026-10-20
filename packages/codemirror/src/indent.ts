import {
  IndentContext,
  indentOnInput,
  indentService,
} from "@codemirror/language";
import { EditorState, type Extension } from "@codemirror/state";

/**
 * Matches an open XML tag at the end of a line that is NOT:
 * - A self-closing tag (e.g. `<val ... />`)
 * - A closing tag (e.g. `</template>`)
 * - An XML comment (e.g. `<!-- ... -->`)
 * - A processing instruction (e.g. `<?xml ... ?>`)
 */
const OPEN_TAG_RE = /<(?!\?|!--|\/|[^>]*\/>)[_a-zA-Z0-9\-:]+(?:\s+[^>]*)?>\s*$/;

/**
 * Matches an open bracket or YAML colon at the end of a line:
 * - `{`, `[`, `(`, or `<`
 * - `:` (used in YAML headers or blocks)
 */
const OPEN_BRACKET_RE = /(?:[{[(<]|:)\s*$/;

/**
 * Matches a closing tag or closing bracket at the start of a line:
 * - `</tagName>`
 * - `}`, `]`, `)`
 */
const CLOSE_RE = /^\s*(?:<\/[_a-zA-Z0-9\-:]+>|[}\])])/;

/**
 * Computes the indentation for a line in TypePrompt:
 * - Indents if the previous non-empty line ended with an open tag or open bracket.
 * - Outdents if the current line starts with a closing tag or closing bracket.
 * - Outdents if the previous line closed a comment (e.g. `   *\/`).
 *
 * Supports both standard indentation queries and simulated line breaks
 * (such as when `insertNewlineAndIndent` evaluates the next line's indent before inserting).
 */
export function typepromptIndentCalculation(
  context: IndentContext,
  pos: number,
): number | null {
  const { state } = context;
  const doc = state.doc;
  const curDocLine = doc.lineAt(pos);

  // Check if we are simulating a line break at or within curDocLine
  const simBreak = (
    context as unknown as { options?: { simulateBreak?: number } }
  ).options?.simulateBreak;
  const isSimulated =
    simBreak != null &&
    simBreak >= curDocLine.from &&
    simBreak <= curDocLine.to;

  let prevText = "";
  let prevIndent = 0;

  if (isSimulated) {
    const lineBefore = context.lineAt(pos, -1);
    if (/\S/.test(lineBefore.text)) {
      prevText = lineBefore.text;
      prevIndent = context.lineIndent(pos, -1);
    } else {
      // The line before simulated break is empty; look backwards in doc
      for (let n = curDocLine.number - 1; n >= 1; n--) {
        const l = doc.line(n);
        if (/\S/.test(l.text)) {
          prevText = l.text;
          prevIndent = context.lineIndent(l.from);
          break;
        }
      }
    }
  } else {
    // Normal query for an existing line in doc
    if (curDocLine.number <= 1) {
      return 0;
    }
    for (let n = curDocLine.number - 1; n >= 1; n--) {
      const l = doc.line(n);
      if (/\S/.test(l.text)) {
        prevText = l.text;
        prevIndent = context.lineIndent(l.from);
        break;
      }
    }
  }

  // If no previous non-empty line exists, default to 0
  if (!prevText) {
    return 0;
  }

  // 1. If current line closes a multiline comment (starts with `*/`), find the opening
  // `/*` to align the `*` of `*/` with the first `*` of the comment.
  const currentText = context.textAfterPos(pos);
  if (/^\s*\*\//.test(currentText)) {
    for (let n = curDocLine.number - 1; n >= 1; n--) {
      const l = doc.line(n);
      const match = /^(\s*)\/\*/.exec(l.text);
      if (match) {
        return match[1].length + 1;
      }
    }
  }

  // 2. If previous line opened a multiline comment (e.g. `   /**`) that was not
  // closed: indent the new line to align with the first star (slash column + 1)
  const commentOpenMatch = /^(\s*)\/\*/.exec(prevText);
  if (commentOpenMatch && !/\*\//.test(prevText)) {
    return commentOpenMatch[1].length + 1;
  }

  // 3. If previous line is a comment continuation (`   * ...`), maintain star alignment
  const starContinuationMatch = /^(\s*)\*(?!\/)/.exec(prevText);
  if (starContinuationMatch && !/\*\//.test(prevText)) {
    return starContinuationMatch[1].length;
  }

  // 4. If previous line closed a comment (e.g. `   */`), outdent by 1 space to match comment base
  if (/^\s*\*\/\s*$/.test(prevText)) {
    const match = /^(\s*)\*\//.exec(prevText);
    if (match) {
      return Math.max(0, match[1].length - 1);
    }
  }

  // Check if previous line opens an indent (ends with open tag or open bracket)
  const opensIndent =
    OPEN_TAG_RE.test(prevText) || OPEN_BRACKET_RE.test(prevText);

  // Check if current line closes an indent (starts with closing tag or closing bracket)
  const closesIndent = CLOSE_RE.test(currentText);

  let indent = prevIndent;
  if (opensIndent) {
    indent += context.unit;
  }
  if (closesIndent) {
    indent = Math.max(0, indent - context.unit);
  }

  return indent;
}

/**
 * Indentation extension for TypePrompt:
 * - Provides automatic indentation rules (open bracket / open tag increases indent, closing tag decreases).
 * - Enables automatic reindentation when typing closing brackets or tags via `indentOnInput`.
 */
export const typepromptIndentation: Extension = [
  indentService.of(typepromptIndentCalculation),
  indentOnInput(),
  EditorState.languageData.of(() => [
    {
      indentOnInput: /^\s*(?:<\/[_a-zA-Z0-9\-:]+>|[}\])]|\*\/\s*)$/,
    },
  ]),
];
