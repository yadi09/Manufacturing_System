/** Up to two letters from the first two words of a name, for avatars. Works for Latin and Ethiopic. */
export function initials(name: string): string {
  return Array.from(
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => Array.from(w)[0] ?? "")
      .join(""),
  )
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
