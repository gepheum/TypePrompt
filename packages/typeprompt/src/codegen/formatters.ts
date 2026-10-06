export function reformatCFamilyCode(
  code: string,
  options?: {
    indentUnit?: string;
    baseIndent?: number;
  },
): string {
  const indentUnit = options?.indentUnit ?? "  ";
  const baseIndent = options?.baseIndent ?? 0;

  const inputLines: readonly string[] = code.split("\n");
  const outputLines: string[] = [];

  // The indent at every line is obtained by repeating indentUnit N times,
  // where N is the length of this array.
  const contextStack: Array<"{" | "(" | "[" | "<" | ":" | "."> = [];
  // Returns the last element in `contextStack`.
  const peakTop = (): string => contextStack.at(-1)!;
  const getMatchingLeftBracket = (r: "}" | ")" | "]" | ">"): string => {
    switch (r) {
      case "}":
        return "{";
      case ")":
        return "(";
      case "]":
        return "[";
      case ">":
        return "<";
    }
  };
  for (let line of inputLines) {
    line = line.trim();
    if (line.length <= 0) {
      // Don't indent empty lines.
      outputLines.push("");
      continue;
    }

    const firstChar = line[0];
    switch (firstChar) {
      case "}":
      case ")":
      case "]":
      case ">": {
        const left = getMatchingLeftBracket(firstChar);
        while (contextStack.pop() !== left) {
          if (contextStack.length <= 0) {
            throw Error();
          }
        }
        break;
      }
      case ".": {
        if (peakTop() !== ".") {
          contextStack.push(".");
        }
        break;
      }
    }
    const isComment = line.startsWith("/") || line.startsWith("*");
    const lastChar = line.slice(-1);
    if (!isComment && lastChar === ":" && peakTop() === ":") {
      contextStack.pop();
    }
    const indent =
      indentUnit.repeat(contextStack.length + baseIndent) +
      (line.startsWith("*") ? " " : "");
    outputLines.push(`${indent}${line.trimEnd()}`);
    if (isComment) continue;
    switch (lastChar) {
      case "{":
      case "(":
      case "[":
      case "<": {
        // The next line will be indented
        contextStack.push(lastChar);
        break;
      }
      case ":":
      case "=": {
        if (peakTop() !== ":") {
          contextStack.push(":");
        }
        break;
      }
      case ";":
      case ",": {
        if (peakTop() === "." || peakTop() === ":") {
          contextStack.pop();
        }
      }
    }
  }

  if (contextStack.length >= 1) {
    throw new Error(JSON.stringify(contextStack));
  }

  return outputLines.join("\n");
}

export function coalesceEmptyLines(code: string): string {
  return (
    code
      // Remove spaces enclosed within curly brackets if that's all there is.
      .replace(/\{\s+\}/g, "{}")
      // Remove spaces enclosed within round brackets if that's all there is.
      .replace(/\(\s+\)/g, "()")
      // Remove spaces enclosed within square brackets if that's all there is.
      .replace(/\[\s+\]/g, "[]")
      // Remove empty line following an open curly bracket.
      .replace(/(\{\n *)\n/g, "$1")
      // Remove empty line preceding a closed curly bracket.
      .replace(/\n(\n *\})/g, "$1")
      // Coalesce consecutive empty lines.
      .replace(/\n\n\n+/g, "\n\n")
      .replace(/\n*$/g, "\n")
  );
}
