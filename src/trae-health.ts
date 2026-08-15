import { checkTraeBackend } from "./trae-client.js";

export type TraeHealth = {
  ok: boolean;
  authenticated: boolean;
  backendAvailable: boolean;
  appVersion: "3.3.87";
  model: "no_thinking_model";
  transport: "direct-internal-api";
};

export async function getTraeHealth(
  getToken: () => Promise<string>,
): Promise<TraeHealth> {
  try {
    const token = await getToken();
    const backendAvailable = await checkTraeBackend(token);
    return {
      ok: backendAvailable,
      authenticated: true,
      backendAvailable,
      appVersion: "3.3.87",
      model: "no_thinking_model",
      transport: "direct-internal-api",
    };
  } catch {
    return {
      ok: false,
      authenticated: false,
      backendAvailable: false,
      appVersion: "3.3.87",
      model: "no_thinking_model",
      transport: "direct-internal-api",
    };
  }
}
