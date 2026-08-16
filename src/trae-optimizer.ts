import { readFile } from "node:fs/promises";
import path from "node:path";
import { PROJECT_ROOT } from "./paths.js";
import { optimizeWithTrae } from "./trae-client.js";
import type { OptimizeResponse } from "./types.js";
import { validateInput } from "./validation.js";

const TRAE_PROMPT_PATH = path.join(
  PROJECT_ROOT,
  "prompts",
  "trae-cn-input-optimization.md",
);

export async function optimizePromptWithTrae(
  inputValue: unknown,
  token: string,
): Promise<OptimizeResponse> {
  const input = validateInput(inputValue);
  const officialPrompt = (await readFile(TRAE_PROMPT_PATH, "utf8")).trimEnd();
  const result = await optimizeWithTrae(token, officialPrompt, input);
  const optimized = result.optimizedPrompt.trim();

  return {
    optimized,
    metrics: {
      inputChars: input.length,
      outputChars: optimized.length,
      expansionRatio: Number((optimized.length / input.length).toFixed(2)),
      durationMs: result.durationMs,
      tokenUsage: result.tokenUsage,
    },
    traceId: result.traceId,
  };
}
