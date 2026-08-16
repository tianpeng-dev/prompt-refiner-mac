import { randomUUID } from "node:crypto";

const TRAE_API_BASE = "https://trae-api-cn.mchost.guru";
const TRAE_APP_ID = "6eefa01c-1036-4c7e-9ca5-d891f63bfcd8";
const TRAE_VERSION = "3.3.88";
const TRAE_VERSION_CODE = "20260212";

export const TRAE_TIMEOUT_MS = 50_000;

type FetchLike = typeof fetch;

type TraeSseResult = {
  optimizedPrompt: string;
  tokenUsage: number | null;
};

export type TraeResult = TraeSseResult & {
  durationMs: number;
  traceId: string;
};

export class TraeApiError extends Error {
  constructor(
    message: string,
    readonly kind: "auth" | "credits" | "protocol" | "unavailable",
    readonly statusCode = 502,
  ) {
    super(message);
    this.name = "TraeApiError";
  }
}

function requestHeaders(token: string, traceId: string): HeadersInit {
  const requestId = randomUUID();
  return {
    accept: "text/event-stream",
    "content-type": "application/json",
    "request-traffic-type": "prod",
    "x-app-id": TRAE_APP_ID,
    "x-app-version": "default",
    "x-app-version-code": TRAE_VERSION_CODE,
    "x-custom-trace-id": traceId,
    "x-ide-token": token,
    "x-ide-version": TRAE_VERSION,
    "x-ide-version-code": TRAE_VERSION_CODE,
    "x-ide-version-type": "stable",
    "x-request-id": requestId,
    "x-trae-request-id": requestId,
  };
}

function apiError(status: number, upstreamCode?: number): TraeApiError {
  if (status === 401 || status === 403 || upstreamCode === 1001) {
    return new TraeApiError(
      "Trae 登录已失效，请在 Trae CN 中重新登录后再试。",
      "auth",
      401,
    );
  }
  if (status === 402 || status === 429 || upstreamCode === 429) {
    return new TraeApiError(
      "Trae Credits 不足或请求过于频繁，请稍后再试。",
      "credits",
      429,
    );
  }
  if (status === 400 || upstreamCode === 4001) {
    return new TraeApiError(
      "Trae 接口拒绝了请求；当前内部协议可能已变更。",
      "protocol",
    );
  }
  return new TraeApiError("Trae 优化服务暂时不可用，请稍后重试。", "unavailable");
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function upstreamCode(value: unknown): number | undefined {
  if (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    typeof value.code === "number"
  ) {
    return value.code;
  }
  return undefined;
}

export function parseTraeSse(body: string): TraeSseResult {
  const output: string[] = [];
  let tokenUsage: number | null = null;

  for (const block of body.replaceAll("\r\n", "\n").split("\n\n")) {
    if (!block.trim()) continue;
    let event = "message";
    const dataLines: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    }
    if (dataLines.length === 0) continue;
    const data = parseJson(dataLines.join("\n"));

    if (event === "error") {
      throw apiError(502, upstreamCode(data));
    }
    if (
      event === "output" &&
      typeof data === "object" &&
      data !== null &&
      "response" in data &&
      typeof data.response === "string"
    ) {
      output.push(data.response);
    }
    if (
      event === "token_usage" &&
      typeof data === "object" &&
      data !== null &&
      "total_tokens" in data &&
      typeof data.total_tokens === "number"
    ) {
      tokenUsage = data.total_tokens;
    }
  }

  const optimizedPrompt = output.join("").trim();
  if (!optimizedPrompt) {
    throw new TraeApiError(
      "Trae 返回了空结果；当前内部协议可能已变更。",
      "protocol",
    );
  }
  return { optimizedPrompt, tokenUsage };
}

export function createTraeOptimizationInput(input: string): string {
  return JSON.stringify({ user_input: input, placeholder_map: "{}" });
}

export async function optimizeWithTrae(
  token: string,
  officialPrompt: string,
  input: string,
  fetchImpl: FetchLike = fetch,
): Promise<TraeResult> {
  const traceId = randomUUID().replaceAll("-", "");
  const startedAt = performance.now();
  let response: Response;

  try {
    response = await fetchImpl(`${TRAE_API_BASE}/api/agent/v3/llm_utils_chat`, {
      method: "POST",
      headers: requestHeaders(token, traceId),
      body: JSON.stringify({
        function: "chat",
        usage: "input_optimization",
        model: "no_thinking_model",
        messages: [
          {
            role: "system",
            content: [{ type: "text", text: officialPrompt }],
          },
          {
            role: "user",
            content: [
              { type: "text", text: createTraeOptimizationInput(input) },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(TRAE_TIMEOUT_MS),
    });
  } catch {
    throw new TraeApiError("无法连接 Trae 优化服务，请检查网络后重试。", "unavailable");
  }

  const responseBody = await response.text();
  if (!response.ok) {
    throw apiError(response.status, upstreamCode(parseJson(responseBody)));
  }
  const parsed = parseTraeSse(responseBody);
  return {
    ...parsed,
    durationMs: Math.round(performance.now() - startedAt),
    traceId,
  };
}

export async function checkTraeBackend(
  token: string,
  fetchImpl: FetchLike = fetch,
): Promise<boolean> {
  const traceId = randomUUID().replaceAll("-", "");
  let response: Response;
  try {
    response = await fetchImpl(`${TRAE_API_BASE}/api/ide/v1/batch_get_detail_param`, {
      method: "POST",
      headers: requestHeaders(token, traceId),
      body: JSON.stringify({
        functions: ["chat"],
        agent_type: "chat",
        current_config_info: { config_name: "", is_custom_model: false },
        mode_type: 0,
        access_type: 0,
        ab_force_vids: "",
        ab_autotest_advanced_mode: 0,
        show_custom_model: true,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return false;
  }
  if (!response.ok) return false;

  const data: unknown = await response.json().catch(() => null);
  if (
    typeof data !== "object" ||
    data === null ||
    !("function_configs" in data) ||
    !Array.isArray(data.function_configs)
  ) {
    return false;
  }
  return data.function_configs.some((config) => {
    if (
      typeof config !== "object" ||
      config === null ||
      !("function" in config) ||
      config.function !== "chat" ||
      !("config_info_list" in config) ||
      !Array.isArray(config.config_info_list)
    ) {
      return false;
    }
    return config.config_info_list.some(
      (item: unknown) =>
        typeof item === "object" &&
        item !== null &&
        "usage" in item &&
        item.usage === "input_optimization" &&
        "config_switch" in item &&
        item.config_switch === true,
    );
  });
}
