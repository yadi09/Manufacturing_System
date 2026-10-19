import { describe, expect, it } from "vitest";
import { ApiError } from "../../api/client";
import { loginProblem } from "./loginErrors";

describe("loginProblem", () => {
  it("wrong credentials", () => {
    expect(loginProblem(new ApiError(401, "invalid_credentials"))).toEqual({ kind: "invalid" });
  });
  it("locked: rounds Retry-After up to whole minutes and says until when", () => {
    expect(loginProblem(new ApiError(429, "too_many_attempts", 840), 1_000)).toEqual({ kind: "locked", minutes: 14, until: 841_000 });
    expect(loginProblem(new ApiError(429, "too_many_attempts", 61), 0)).toMatchObject({ minutes: 2 });
    expect(loginProblem(new ApiError(429, "too_many_attempts", 1), 0)).toMatchObject({ minutes: 1 });
  });
  it("locked without a header still pauses for a minute", () => {
    expect(loginProblem(new ApiError(429, "too_many_attempts"), 0)).toEqual({ kind: "locked", minutes: 1, until: 60_000 });
  });
  it("no connection", () => {
    expect(loginProblem(new ApiError(0, "network"))).toEqual({ kind: "offline" });
  });
  it("anything else", () => {
    expect(loginProblem(new ApiError(500, "internal"))).toEqual({ kind: "other" });
    expect(loginProblem(new Error("boom"))).toEqual({ kind: "other" });
  });
});
