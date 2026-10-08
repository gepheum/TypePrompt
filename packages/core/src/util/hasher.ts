export function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to a 32-bit integer
  }
  return hash;
}

export function combineHashesUnordered(hashes: readonly number[]): number {
  let hash = 0;
  for (const h of hashes) {
    hash += h;
    hash |= 0;
  }
  return hash;
}
