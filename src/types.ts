export type OptimizeMetrics = {
  inputChars: number;
  outputChars: number;
  expansionRatio: number;
  durationMs: number;
  tokenUsage: number | null;
};

export type OptimizeResponse = {
  optimized: string;
  metrics: OptimizeMetrics;
  traceId: string;
};
