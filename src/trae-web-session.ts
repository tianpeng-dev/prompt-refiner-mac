export const TRAE_WEB_LOGIN_URL = "https://www.trae.cn/login";
export const TRAE_WEB_TOKEN_URL =
  "https://api.trae.cn/cloudide/api/v3/common/GetUserToken";
export const TRAE_WEB_TOKEN_STORAGE_KEY = "Cloud-IDE-Token";

export function parseTraeWebTokenResponse(value: unknown): string | null {
  if (
    typeof value !== "object" ||
    value === null ||
    !("Result" in value) ||
    typeof value.Result !== "object" ||
    value.Result === null ||
    !("Token" in value.Result) ||
    typeof value.Result.Token !== "string"
  ) {
    return null;
  }
  const token = value.Result.Token.trim();
  return token || null;
}

export function isTraeWebsiteUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === "trae.cn" ||
        url.hostname.endsWith(".trae.cn") ||
        url.hostname === "trae.com.cn" ||
        url.hostname.endsWith(".trae.com.cn"))
    );
  } catch {
    return false;
  }
}
