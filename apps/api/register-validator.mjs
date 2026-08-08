import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const appDirectory = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(appDirectory, ".env"), quiet: true });

const signature = process.argv[2];
if (!/^0x[a-fA-F0-9]{130}$/.test(signature ?? "")) {
  throw new Error("Pass the 65-byte owner signature as the only argument.");
}
if (process.env.CLEANVERSE_WRITE_ENABLED !== "true") {
  throw new Error("Set CLEANVERSE_WRITE_ENABLED=true before registration.");
}

const apiId = process.env.CLEANVERSE_API_ID;
const encodedKey = process.env.CLEANVERSE_API_KEY;
const baseUrl = process.env.CLEANVERSE_BASE_URL;
if (!apiId || !encodedKey || !baseUrl) {
  throw new Error("Cleanverse API configuration is incomplete.");
}

const contractAddress = "0xb5bdc630f78beb587235c42e4fd4b6c67fd1d65a";
const payload = {
  chain: "monad",
  contract_address: contractAddress,
  rule: {
    allowed_group: "",
    allowed_sub_group: "",
    min_tier: 20,
    min_sub_tier: 0,
    is_black_list: false,
    countries: [],
  },
  owner_signature: signature,
};

const key = Buffer.from(encodedKey, "base64");
const cipher = crypto.createCipheriv("aes-256-cbc", key, Buffer.alloc(16));
const encrypted = Buffer.concat([
  cipher.update(JSON.stringify(payload), "utf8"),
  cipher.final(),
]).toString("base64");

const response = await fetch(`${baseUrl}/validator/register`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "api-id": apiId,
    "x-request-id": crypto.randomUUID(),
  },
  body: JSON.stringify({ data: encrypted }),
  signal: AbortSignal.timeout(20_000),
});
const result = await response.json();
if (!response.ok || result?.code !== "0000") {
  throw new Error(`Cleanverse registration failed: ${JSON.stringify(result)}`);
}

console.log(JSON.stringify(result.data, null, 2));
