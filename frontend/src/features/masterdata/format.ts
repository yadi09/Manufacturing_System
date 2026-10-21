/** "30.000" becomes "30", "0.800000" becomes "0.8". The server keeps exact decimals; people read them trimmed. */
export function trimDecimal(value: string | null | undefined): string {
  if (!value) return "";
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
}

/** True for a positive plain decimal (digits, optionally a dot and at most `places` more digits). */
export function isPositiveDecimal(value: string, places: number): boolean {
  const v = value.trim();
  if (!new RegExp(`^\\d{1,9}(\\.\\d{1,${places}})?$`).test(v)) return false;
  return Number(v) > 0;
}
