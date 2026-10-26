import { describe, expect, it } from "vitest";
import { generatePassword } from "./password";

describe("generatePassword", () => {
  it("looks like Kf7-mQ2x-Rt9w: three groups of four, at least 10 characters", () => {
    for (let i = 0; i < 200; i++) {
      const p = generatePassword();
      expect(p).toMatch(/^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/);
      expect(p.length).toBeGreaterThanOrEqual(10);
    }
  });
  it("never uses look-alike characters", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) for (const c of generatePassword().replaceAll("-", "")) seen.add(c);
    for (const bad of "0O1lI") expect(seen.has(bad)).toBe(false);
  });
  it("does not repeat", () => {
    const all = new Set(Array.from({ length: 500 }, generatePassword));
    expect(all.size).toBe(500);
  });
});
