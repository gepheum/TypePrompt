const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const MAX_VALID = 62n ** 8n; // 218_340_105_584_896n (62^8)

/**
 * Generates an 8-character Base62 identifier from a cryptographically secure RNG.
 * Uses 6 random bytes (48 bits) with rejection sampling to eliminate modulo bias,
 * selecting uniformly from 62^8 (~2.18 * 10^14) combinations.
 */
export function generateInferenceSetId(): string {
  const bytes = new Uint8Array(6);
  while (true) {
    crypto.getRandomValues(bytes);
    let num = 0n;
    for (let i = 0; i < 6; i++) {
      num = (num << 8n) | BigInt(bytes[i]!);
    }
    if (num < MAX_VALID) {
      let id = "";
      for (let i = 0; i < 8; i++) {
        id = BASE62[Number(num % 62n)]! + id;
        num /= 62n;
      }
      return id;
    }
  }
}
