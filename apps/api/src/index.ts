import "dotenv/config";
import crypto from "node:crypto";
import cors from "cors";
import express from "express";
import { getAddress, verifyMessage, type Address, type Hex } from "viem";
import { z } from "zod";
import {
  CleanverseApiError,
  cleanverseConfiguration,
  cleanverseConfigured,
  generateApass,
  launchAtoken,
  queryAtokenApplyStatus,
  queryApass,
  verifyApassForAtoken,
} from "./cleanverse.js";
import {
  loadRegistryHistory,
  registryHistorySnapshot,
} from "./registry-history.js";

const app = express();
app.disable("x-powered-by");
const corsOrigins = (
  process.env.CORS_ORIGINS ||
  "http://localhost:5173,http://127.0.0.1:5173"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
app.use(cors({ origin: corsOrigins }));
app.use((_request, response, next) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  next();
});
app.use(express.json({ limit: "32kb" }));

const revision =
  process.env.RAILWAY_GIT_COMMIT_SHA ??
  process.env.COVEN_REVISION ??
  "local";

function readiness() {
  const missing: string[] = [];
  const cleanverse = cleanverseConfiguration();
  if (!cleanverse.apiIdConfigured) missing.push("CLEANVERSE_API_ID");
  if (!cleanverse.apiKeyConfigured) missing.push("CLEANVERSE_API_KEY");
  if (!process.env.CORS_ORIGINS?.trim()) missing.push("CORS_ORIGINS");
  return { ready: missing.length === 0, missing };
}

const cviChallenges = new Map<
  string,
  { message: string; expiresAt: number }
>();
const recentCviEnrollments = new Map<string, number>();
const cvaLaunchChallenges = new Map<
  string,
  { address: Address; message: string; payloadDigest: string; expiresAt: number }
>();
const cviChallengeLifetimeMs = 5 * 60 * 1_000;
const cviEnrollmentCooldownMs = 30 * 1_000;
let registryAssetsRefresh: Promise<unknown> | null = null;

function refreshRegistryAssets() {
  if (registryAssetsRefresh) return;
  registryAssetsRefresh = loadRegistryHistory()
    .catch((error) => {
      console.error("Background registry refresh failed", error);
    })
    .finally(() => {
      registryAssetsRefresh = null;
    });
}

function isMissingApass(error: unknown) {
  return (
    error instanceof CleanverseApiError &&
    error.code === "0002" &&
    error.message.toLowerCase().includes("apass not found")
  );
}

function sandboxCustomerId(address: Address) {
  return `CVN${crypto
    .createHash("sha256")
    .update(address.toLowerCase())
    .digest("hex")
    .slice(0, 21)}`;
}

const cvaLaunchRequestSchema = z.object({
  chain: z.literal("monad"),
  token_name: z.string().min(2).max(64),
  token_symbol: z.string().min(2).max(12),
  decimals: z.number().int().min(0).max(18),
  admin_address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  icon: z.string().url(),
  rule: z.object({
    allowed_group: z.string().max(2),
    allowed_sub_group: z.string(),
    min_tier: z.number().int().min(0),
    min_sub_tier: z.number().int().min(0),
    is_black_list: z.literal(false),
    countries: z.array(z.string().regex(/^[A-Z]{2}$/)).max(32),
  }),
});

function launchPayloadDigest(payload: z.infer<typeof cvaLaunchRequestSchema>) {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    service: "coven-api",
    revision,
    cleanverseConfigured: cleanverseConfigured(),
    writesEnabled: process.env.CLEANVERSE_WRITE_ENABLED === "true",
  });
});

app.get("/api/ready", (_request, response) => {
  const status = readiness();
  response.status(status.ready ? 200 : 503).json({
    ok: status.ready,
    service: "coven-api",
    revision,
    missing: status.missing,
  });
});

app.get("/api/registry/history/:address", async (request, response) => {
  const parsed = z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .safeParse(request.params.address);
  if (!parsed.success) {
    response.status(400).json({ error: "A valid Monad wallet is required." });
    return;
  }

  try {
    response.json(
      await loadRegistryHistory(parsed.data as `0x${string}`),
    );
  } catch (error) {
    console.error("Registry history load failed", error);
    response.status(502).json({
      error: "Monad registry history is temporarily unavailable.",
    });
  }
});

app.get("/api/registry/assets", async (_request, response) => {
  try {
    response.json({ ...registryHistorySnapshot(), refreshing: true });
    refreshRegistryAssets();
  } catch (error) {
    console.error("Registry asset discovery failed", error);
    response.status(502).json({
      error: "Registered CVAs are temporarily unavailable.",
    });
  }
});

app.post("/api/compliance/cvi", async (request, response) => {
  const parsed = z
    .object({
      chain: z.literal("monad"),
      address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    })
    .safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "A valid Monad wallet is required." });
    return;
  }

  if (!cleanverseConfigured()) {
    response.status(503).json({
      error: "Cleanverse sandbox access is not configured.",
    });
    return;
  }

  try {
    response.json({ mode: "live", ...(await queryApass("monad", parsed.data.address) as object) });
  } catch (error) {
    if (isMissingApass(error)) {
      response.status(404).json({
        code: "CVI_NOT_FOUND",
        error: "This wallet does not have a Cleanverse CVI yet.",
      });
      return;
    }
    response.status(502).json({
      error: error instanceof Error ? error.message : "CVI lookup failed",
    });
  }
});

app.post("/api/compliance/cvi/challenge", (request, response) => {
  const parsed = z
    .object({ address: z.string().regex(/^0x[a-fA-F0-9]{40}$/) })
    .safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "A valid Monad wallet is required." });
    return;
  }

  const address = getAddress(parsed.data.address);
  const now = Date.now();
  for (const [key, value] of cviChallenges) {
    if (value.expiresAt < now) cviChallenges.delete(key);
  }
  for (const [key, attemptedAt] of recentCviEnrollments) {
    if (now - attemptedAt >= cviEnrollmentCooldownMs) {
      recentCviEnrollments.delete(key);
    }
  }
  const expiresAt = now + cviChallengeLifetimeMs;
  const message = [
    "Coven sandbox CVI enrollment",
    `Wallet: ${address}`,
    "Chain: monad",
    `Nonce: ${crypto.randomUUID()}`,
    `Expires: ${new Date(expiresAt).toISOString()}`,
    "This signature proves wallet ownership and does not authorize a transaction.",
  ].join("\n");
  cviChallenges.set(address.toLowerCase(), { message, expiresAt });
  response.json({ address, message, expiresAt });
});

app.post("/api/compliance/cvi/enroll", async (request, response) => {
  const parsed = z
    .object({
      address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
      signature: z.string().regex(/^0x[a-fA-F0-9]+$/),
    })
    .safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "A wallet address and signature are required." });
    return;
  }

  const address = getAddress(parsed.data.address);
  const challengeKey = address.toLowerCase();
  const challenge = cviChallenges.get(challengeKey);
  if (!challenge || challenge.expiresAt < Date.now()) {
    cviChallenges.delete(challengeKey);
    response.status(400).json({
      error: "The enrollment request expired. Start the CVI enrollment again.",
    });
    return;
  }

  const verified = await verifyMessage({
    address,
    message: challenge.message,
    signature: parsed.data.signature as Hex,
  }).catch(() => false);
  if (!verified) {
    response.status(401).json({
      error: "The signature does not match the connected wallet.",
    });
    return;
  }
  cviChallenges.delete(challengeKey);

  const lastAttempt = recentCviEnrollments.get(challengeKey) || 0;
  if (Date.now() - lastAttempt < cviEnrollmentCooldownMs) {
    response.status(429).json({
      error: "Cleanverse enrollment is already processing. Check CVI again shortly.",
    });
    return;
  }

  try {
    const existing = await queryApass("monad", address).catch((error) => {
      if (isMissingApass(error)) return null;
      throw error;
    });
    if (existing) {
      response.json({ mode: "live", enrollment: "existing", ...(existing as object) });
      return;
    }

    recentCviEnrollments.set(challengeKey, Date.now());
    const customerId = sandboxCustomerId(address);
    const result = await generateApass({
      customerId,
      kycSource: "CovenSandbox",
      kycId: customerId,
      override: false,
      expirationTime: Math.floor(Date.now() / 1_000) + 365 * 24 * 60 * 60,
      wallet: { address, chain: "monad" },
    });
    response.status(202).json({
      mode: "live",
      enrollment: "submitted",
      ...(result as object),
    });
  } catch (error) {
    recentCviEnrollments.delete(challengeKey);
    response.status(502).json({
      error: error instanceof Error ? error.message : "CVI enrollment failed",
    });
  }
});

app.post("/api/compliance/cva/launch/challenge", (request, response) => {
  const parsed = z
    .object({
      launch: cvaLaunchRequestSchema,
    })
    .safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid CVA issuance request." });
    return;
  }

  const address = getAddress(parsed.data.launch.admin_address);
  const now = Date.now();
  for (const [key, value] of cvaLaunchChallenges) {
    if (value.expiresAt < now) cvaLaunchChallenges.delete(key);
  }
  if (cvaLaunchChallenges.size >= 1_000) {
    response.status(503).json({ error: "CVA authorization is busy. Try again shortly." });
    return;
  }
  const expiresAt = Date.now() + cviChallengeLifetimeMs;
  const payloadDigest = launchPayloadDigest(parsed.data.launch);
  const challengeId = crypto.randomUUID();
  const message = [
    "Coven sandbox CVA launch",
    `Issuer: ${address}`,
    `Token: ${parsed.data.launch.token_symbol}`,
    `Request digest: ${payloadDigest}`,
    `Nonce: ${challengeId}`,
    `Expires: ${new Date(expiresAt).toISOString()}`,
    "This signature authorizes one Cleanverse sandbox launch request and is not an on-chain transaction.",
  ].join("\n");
  cvaLaunchChallenges.set(challengeId, {
    address,
    message,
    payloadDigest,
    expiresAt,
  });
  response.json({ challengeId, address, message, expiresAt });
});

app.post("/api/compliance/cva/launch", async (request, response) => {
  const parsed = z
    .object({
      launch: cvaLaunchRequestSchema,
      challengeId: z.string().uuid(),
      signature: z.string().regex(/^0x[a-fA-F0-9]+$/),
    })
    .safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "A valid CVA request and wallet signature are required." });
    return;
  }

  const address = getAddress(parsed.data.launch.admin_address);
  const challenge = cvaLaunchChallenges.get(parsed.data.challengeId);
  const digest = launchPayloadDigest(parsed.data.launch);
  if (
    !challenge ||
    challenge.expiresAt < Date.now() ||
    challenge.address.toLowerCase() !== address.toLowerCase() ||
    challenge.payloadDigest !== digest
  ) {
    cvaLaunchChallenges.delete(parsed.data.challengeId);
    response.status(400).json({
      error: "The CVA authorization expired or does not match this request. Start again.",
    });
    return;
  }

  const verified = await verifyMessage({
    address,
    message: challenge.message,
    signature: parsed.data.signature as Hex,
  }).catch(() => false);
  cvaLaunchChallenges.delete(parsed.data.challengeId);
  if (!verified) {
    response.status(401).json({ error: "The CVA authorization signature is invalid." });
    return;
  }

  try {
    response.json(await launchAtoken(parsed.data.launch));
  } catch (error) {
    response.status(403).json({
      error: error instanceof Error ? error.message : "CVA launch failed",
    });
  }
});

app.get("/api/compliance/cva/status/:requestId", async (request, response) => {
  const parsed = z
    .string()
    .regex(/^[A-Za-z0-9]{8,64}$/)
    .safeParse(request.params.requestId);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid Cleanverse request ID." });
    return;
  }
  try {
    response.json(await queryAtokenApplyStatus(parsed.data));
  } catch (error) {
    response.status(502).json({
      error:
        error instanceof Error
          ? error.message
          : "CVA status lookup failed",
    });
  }
});

app.post("/api/compliance/transfer/preflight", async (request, response) => {
  const parsed = z
    .object({
      chain: z.literal("monad"),
      atoken: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
      address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    })
    .safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      error: "A valid CVA and recipient wallet are required.",
    });
    return;
  }
  try {
    const result = (await verifyApassForAtoken(
      parsed.data.chain,
      parsed.data.atoken,
      parsed.data.address,
    )) as { code?: number; message?: string; magickLink?: string };
    response.json({
      source: "Cleanverse POST /verify_apass",
      checkedAt: new Date().toISOString(),
      eligible: result?.code === 4,
      ...result,
    });
  } catch (error) {
    response.status(502).json({
      error:
        error instanceof Error
          ? error.message
          : "Transfer eligibility check failed",
    });
  }
});

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => console.log(`Coven API listening on ${port}`));
