import type { ProtectedItem } from "./types.js";

const NUMBER_PATTERN = /(?<![A-Za-z0-9_])\d+(?:\.\d+)?%?/g;

function numbers(text: string): Set<string> {
  const withoutListMarkers = text.replace(
    /((?:^|[\n：:；;])\s*)\d+[.)、）]\s*/gmu,
    "$1",
  );
  return new Set(withoutListMarkers.match(NUMBER_PATTERN) ?? []);
}

export function analyzeDrift(
  original: string,
  optimizedProtected: string,
  protectedItems: ProtectedItem[],
): { warnings: string[]; preservedItems: string[] } {
  const warnings: string[] = [];
  const preservedItems = protectedItems
    .filter((item) => optimizedProtected.includes(item.token))
    .map((item) => item.value);

  const missing = protectedItems.filter(
    (item) => !optimizedProtected.includes(item.token),
  );
  if (missing.length > 0) {
    warnings.push(`有 ${missing.length} 个受保护项未被完整保留。`);
  }

  const originalNumbers = numbers(original);
  const optimizedNumbers = numbers(optimizedProtected);
  const missingNumbers = [...originalNumbers].filter(
    (value) => !optimizedNumbers.has(value),
  );
  const addedNumbers = [...optimizedNumbers].filter(
    (value) => !originalNumbers.has(value),
  );

  if (missingNumbers.length > 0) {
    warnings.push(`原文数字未保留：${missingNumbers.join("、")}`);
  }
  if (addedNumbers.length > 0) {
    warnings.push(`优化结果新增数字：${addedNumbers.join("、")}`);
  }

  return { warnings, preservedItems };
}
