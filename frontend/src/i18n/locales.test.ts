import { describe, expect, it } from "vitest";
import en from "./locales/en.json";
import am from "./locales/am.json";

function keys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === "object" && v !== null ? keys(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

describe("translations", () => {
  it("English and Amharic have identical keys", () => {
    expect(keys(am).sort()).toEqual(keys(en).sort());
  });
  it("no empty strings", () => {
    const empty = (o: Record<string, unknown>): boolean =>
      Object.values(o).some((v) => (typeof v === "object" && v !== null ? empty(v as Record<string, unknown>) : v === ""));
    expect(empty(en)).toBe(false);
    expect(empty(am)).toBe(false);
  });
});
