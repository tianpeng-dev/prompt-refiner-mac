export type ProtectedItem = {
  token: string;
  value: string;
  kind: "code-block" | "inline-code" | "placeholder" | "url" | "path" | "mention";
};

export type ProtectionResult = {
  protectedText: string;
  items: ProtectedItem[];
};

export type OptimizeMetrics = {
  inputChars: number;
  outputChars: number;
  expansionRatio: number;
  preservedItems: string[];
  durationMs: number;
  tokenUsage: number | null;
};

export type OptimizeResponse = {
  optimized: string;
  metrics: OptimizeMetrics;
  warnings: string[];
  traceId: string;
};
