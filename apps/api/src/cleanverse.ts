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

async function request(path: string, body: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "api-id": apiId() },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12_000),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Cleanverse ${response.status}: ${JSON.stringify(result)}`);
  }
  return result;
}

export function queryApass(chain: string, address: string) {
  return request("/query_apass", { chain, address });
}

export function launchAtoken(input: unknown) {
  if (process.env.CLEANVERSE_WRITE_ENABLED !== "true") {
    throw new Error("Cleanverse writes are disabled");
  }
  return request("/atoken/launch", { data: encrypt(input) });
}

export const cleanverseConfigured = () => Boolean(process.env.CLEANVERSE_API_ID);

