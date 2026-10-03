export type CompletionItem = Record<string, never>;

export function getCompletionItems(
  _pathToContent: { readonly [path: string]: string },
  _path: string,
  _position: number,
): readonly CompletionItem[] {
  return [];
}
