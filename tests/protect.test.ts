import { describe, expect, it } from "vitest";
import { findMissingTokens, protectText, restoreText } from "../src/protect.js";

describe("protectText", () => {
  it("round-trips code, paths, URLs, and mentions", () => {
    const input =
      "检查 src/auth/login.ts 和 `retry(3)`，参考 https://example.com/spec，通知 @Agent。";
    const result = protectText(input);
    expect(result.items.map((item) => item.kind)).toEqual([
      "inline-code",
      "url",
      "path",
      "mention",
    ]);
    expect(restoreText(result.protectedText, result.items)).toBe(input);
    expect(findMissingTokens(result.protectedText, result.items)).toEqual([]);
  });

  it("protects fenced code as one item", () => {
    const input = "修复下面代码：\n```ts\nconst x = 1;\n```";
    const result = protectText(input);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].kind).toBe("code-block");
    expect(restoreText(result.protectedText, result.items)).toBe(input);
  });

  it("round-trips common placeholders", () => {
    const input = "把 {{project_name}}、${OWNER}、<<deadline>> 和 <OUTPUT_PATH> 保持原样。";
    const result = protectText(input);
    expect(result.items.map((item) => item.kind)).toEqual([
      "placeholder",
      "placeholder",
      "placeholder",
      "placeholder",
    ]);
    expect(restoreText(result.protectedText, result.items)).toBe(input);
  });
});
