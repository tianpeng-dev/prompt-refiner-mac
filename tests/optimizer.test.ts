import { describe, expect, it } from "vitest";
import { analyzeDrift } from "../src/drift.js";
import { protectText } from "../src/protect.js";
import { validateInput } from "../src/validation.js";

describe("validateInput", () => {
  it("trims normal input", () => {
    expect(validateInput("  修复登录问题  ")).toBe("修复登录问题");
  });

  it("rejects empty and overlong input", () => {
    expect(() => validateInput("   ")).toThrow("请输入");
    expect(() => validateInput("x".repeat(2001))).toThrow("2000");
  });

  it("accepts the exact 2000-character boundary and English input", () => {
    expect(validateInput("x".repeat(2000))).toHaveLength(2000);
    expect(validateInput("  Fix the retry bug.  ")).toBe("Fix the retry bug.");
  });
});

describe("analyzeDrift", () => {
  it("warns about added and missing numbers", () => {
    const input = "在 3 天内修复 src/a.ts";
    const protectedInput = protectText(input);
    const output = protectedInput.protectedText.replace("3", "5");
    const result = analyzeDrift(input, output, protectedInput.items);
    expect(result.warnings.join(" ")).toContain("3");
    expect(result.warnings.join(" ")).toContain("5");
  });

  it("does not treat numbered-list markers as factual drift", () => {
    const result = analyzeDrift("整理方案", "整理方案：1）目标；2）验收。", []);
    expect(result.warnings).toEqual([]);
  });

  it("recognizes numbers next to Chinese text", () => {
    const result = analyzeDrift("偶发 401 错误", "偶发出现401错误", []);
    expect(result.warnings).toEqual([]);
  });
});
