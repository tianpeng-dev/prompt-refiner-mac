import path from "node:path";

export const PROJECT_ROOT = path.resolve(
  process.env.PROMPT_REFINER_ROOT ?? process.cwd(),
);
