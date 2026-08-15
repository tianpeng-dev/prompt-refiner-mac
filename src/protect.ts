import type { ProtectedItem, ProtectionResult } from "./types.js";

const PATTERNS: Array<{ kind: ProtectedItem["kind"]; regex: RegExp }> = [
  { kind: "code-block", regex: /```[\s\S]*?```/g },
  { kind: "inline-code", regex: /`[^`\n]+`/g },
  {
    kind: "placeholder",
    regex: /\$\{[^{}\n]+\}|\{\{[^{}\n]+\}\}|<<[^<>\n]+>>|<[\p{L}\p{N}_-]{2,}>/gu,
  },
  { kind: "url", regex: /https?:\/\/[^\s<>()\[\]{}]+/g },
  {
    kind: "path",
    regex:
      /(?:(?:\.{0,2}\/|\/|[A-Za-z]:\\)(?:[^\s<>:"|?*\n]+[\\/])*[^\s<>:"|?*\n]+|(?:[\w.-]+\/)+[\w.-]+\.[A-Za-z0-9]+)/g,
  },
  { kind: "mention", regex: /(?:@|#)[\p{L}\p{N}_./-]+/gu },
];

export function protectText(input: string): ProtectionResult {
  let protectedText = input;
  const items: ProtectedItem[] = [];

  for (const { kind, regex } of PATTERNS) {
    protectedText = protectedText.replace(regex, (value) => {
      if (/^⟦PROTECTED_\d{3}⟧$/.test(value)) return value;
      const token = `⟦PROTECTED_${String(items.length).padStart(3, "0")}⟧`;
      items.push({ token, value, kind });
      return token;
    });
  }

  return { protectedText, items };
}

export function restoreText(input: string, items: ProtectedItem[]): string {
  return items.reduce(
    (result, item) => result.replaceAll(item.token, item.value),
    input,
  );
}

export function findMissingTokens(
  input: string,
  items: ProtectedItem[],
): ProtectedItem[] {
  return items.filter((item) => !input.includes(item.token));
}
