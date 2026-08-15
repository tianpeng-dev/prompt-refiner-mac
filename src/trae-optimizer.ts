import { readFile } from "node:fs/promises";
import path from "node:path";
import { analyzeDrift } from "./drift.js";
import { PROJECT_ROOT } from "./paths.js";
import { protectText, restoreText } from "./protect.js";
import { optimizeWithTrae } from "./trae-client.js";
import type { OptimizeResponse } from "./types.js";
import { validateInput } from "./validation.js";

const TRAE_PROMPT_PATH = path.join(PROJECT_ROOT, "prompts", "trae-direct.md");

export async function optimizePromptWithTrae(
  inputValue: unknown,
  token: string,
): Promise<OptimizeResponse> {
  const input = validateInput(inputValue);
  const protection = protectText(input);
  const systemPrompt = await readFile(TRAE_PROMPT_PATH, "utf8");
  const result = await optimizeWithTrae(
    token,
    systemPrompt,
    protection.protectedText,
  );
  const analysis = analyzeDrift(input, result.optimizedPrompt, protection.items);
  const optimized = restoreText(result.optimizedPrompt, protection.items);

  return {
    optimized,
    metrics: {
      inputChars: input.length,
      outputChars: optimized.length,
      expansionRatio: Number((optimized.length / input.length).toFixed(2)),
      preservedItems: analysis.preservedItems,
      durationMs: result.durationMs,
      tokenUsage: result.tokenUsage,
    },
    warnings: analysis.warnings,
    traceId: result.traceId,
  };
}
