// No look-alike characters (0/O, 1/l/I), so a password read aloud or copied by hand survives.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/** Three groups of four characters, for example "Kf7-mQ2x-Rt9w". Uses the browser's secure random source. */
export function generatePassword(): string {
  const limit = 256 - (256 % ALPHABET.length); // reject bytes above this so every character is equally likely
  const out: string[] = [];
  while (out.length < 12) {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    for (const b of bytes) {
      if (b < limit && out.length < 12) out.push(ALPHABET[b % ALPHABET.length]);
    }
  }
  return `${out.slice(0, 4).join("")}-${out.slice(4, 8).join("")}-${out.slice(8).join("")}`;
}
