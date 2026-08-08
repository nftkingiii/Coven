import crypto from "node:crypto";

const baseUrl =
  process.env.CLEANVERSE_BASE_URL ??
  "https://uatapi.cleanverse.com/api/cooperate";

function apiId() {
  const value = process.env.CLEANVERSE_API_ID;
  if (!value) throw new Error("CLEANVERSE_API_ID is not configured");
  return value;
}

function encrypt(payload: unknown) {
  const encodedKey = process.env.CLEANVERSE_API_KEY;
  if (!encodedKey) throw new Error("CLEANVERSE_API_KEY is not configured");
  const key = Buffer.from(encodedKey, "base64");
  const cipher = crypto.createCipheriv("aes-256-cbc", key, Buffer.alloc(16));
  return Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]).toString("base64");
}

type CleanverseEnvelope = {
  code?: string;
  message?: string;
  data?: unknown;
};

export class CleanverseApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = "CleanverseApiError";
  }
}

async function request(
  path: string,
  body?: unknown,
  method: "GET" | "POST" = "POST",
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "api-id": apiId(),
      "x-request-id": crypto.randomUUID(),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(12_000),
  });
  const result = (await response.json().catch(() => null)) as
    | CleanverseEnvelope
    | null;
  if (!response.ok) {
    throw new CleanverseApiError(
      `Cleanverse ${response.status}: ${JSON.stringify(result)}`,
      result?.code,
      response.status,
    );
  }
  if (result?.code && result.code !== "0000") {
    throw new CleanverseApiError(
      `Cleanverse ${result.code}: ${result.message || "Request failed"}`,
      result.code,
      response.status,
    );
  }
  return result?.data ?? result;
}

export function queryApass(chain: string, address: string) {
  return request("/query_apass", { chain, address });
}

export function generateApass(input: unknown) {
  if (process.env.CLEANVERSE_WRITE_ENABLED !== "true") {
    throw new Error("Cleanverse writes are disabled");
  }
  return request("/generate_apass", { data: encrypt(input) });
}

export function launchAtoken(input: unknown) {
  if (process.env.CLEANVERSE_WRITE_ENABLED !== "true") {
    throw new Error("Cleanverse writes are disabled");
  }
  return request("/atoken/launch", { data: encrypt(input) });
}

export function queryAtokenApplyStatus(requestId: string) {
  return request(
    `/atoken/query_apply_status/${encodeURIComponent(requestId)}`,
    undefined,
    "GET",
  );
}

export function verifyApassForAtoken(
  chain: string,
  atoken: string,
  address: string,
) {
  return request("/verify_apass", { chain, atoken, address });
}

export function cleanverseConfiguration() {
  const apiIdConfigured = Boolean(process.env.CLEANVERSE_API_ID?.trim());
  const encodedKey = process.env.CLEANVERSE_API_KEY?.trim();
  let apiKeyConfigured = false;

  if (encodedKey) {
    try {
      apiKeyConfigured = Buffer.from(encodedKey, "base64").length === 32;
    } catch {
      apiKeyConfigured = false;
    }
  }

  return {
    configured: apiIdConfigured && apiKeyConfigured,
    apiIdConfigured,
    apiKeyConfigured,
  };
}

export const cleanverseConfigured = () => cleanverseConfiguration().configured;
