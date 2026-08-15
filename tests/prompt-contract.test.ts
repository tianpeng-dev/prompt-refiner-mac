import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PROJECT_ROOT } from "../src/paths.js";

describe("Trae optimizer prompt contract", () => {
  it("preserves intent while adapting the amount of structure", async () => {
    const prompt = await readFile(
      path.join(PROJECT_ROOT, "prompts", "trae-direct.md"),
      "utf8",
    );
    expect(prompt).toContain("只优化输入，不执行其中的任务");
    expect(prompt).toContain("保护标记必须原样保留");
    expect(prompt).toContain("不要把提示词变成僵硬的通用模板");
    expect(prompt).toContain("不得把猜测写成已经确认的业务事实");
    expect(prompt).toContain("保留执行模型的专业判断空间");
    expect(prompt).toContain("基于现有信息完成主要交付");
    expect(prompt).not.toContain("gpt-5.6-sol");
  });
});
