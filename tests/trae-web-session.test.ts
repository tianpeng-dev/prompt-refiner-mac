import { describe, expect, it } from "vitest";
import {
  isTraeWebsiteUrl,
  parseTraeWebTokenResponse,
  TRAE_WEB_TOKEN_URL,
} from "../src/trae-web-session.js";

describe("Trae web session", () => {
  it("extracts only a non-empty official token response", () => {
    expect(parseTraeWebTokenResponse({ Result: { Token: " token " } })).toBe(
      "token",
    );
    expect(parseTraeWebTokenResponse({ Result: { Token: "" } })).toBeNull();
    expect(parseTraeWebTokenResponse({ token: "private" })).toBeNull();
    expect(parseTraeWebTokenResponse(null)).toBeNull();
  });

  it("accepts only HTTPS Trae website origins", () => {
    expect(isTraeWebsiteUrl("https://www.trae.cn/login")).toBe(true);
    expect(isTraeWebsiteUrl("https://api.trae.com.cn/path")).toBe(true);
    expect(isTraeWebsiteUrl("http://www.trae.cn/login")).toBe(false);
    expect(isTraeWebsiteUrl("https://trae.cn.example.com/login")).toBe(false);
  });

  it("uses the website token exchange endpoint", () => {
    expect(TRAE_WEB_TOKEN_URL).toBe(
      "https://api.trae.cn/cloudide/api/v3/common/GetUserToken",
    );
  });
});
