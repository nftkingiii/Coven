import { createHash, randomBytes } from "node:crypto";
import { Barretenberg, UltraHonkBackend } from "@aztec/bb.js";
import { Noir } from "@noir-lang/noir_js";
import express from "express";
import { z } from "zod";
import circuitArtifact from "./invoice_policy.json" with { type: "json" };

const app = express();
const port = Number(process.env.PORT ?? 8080);
const fieldModulus =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const maxInvoiceValue = 100_000n;
const maxMaturityDays = 180;
const allowedOrigins = new Set(
  (process.env.COVEN_WEB_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim()),
);
type Circuit = ConstructorParameters<typeof Noir>[0];
type Hex = `0x${string}`;
type AttestationVerification = {
  success?: boolean;
  checksum?: string;
  quote?: {
    verified?: boolean;
    header?: { tee_type?: string; user_data?: string };
    body?: {
      mrtd?: string;
      rtmr0?: string;
      rtmr1?: string;
      rtmr2?: string;
      rtmr3?: string;
      report_data?: string;
    };
  };
};
let proving = false;
let apiPromise: ReturnType<typeof Barretenberg.new> | undefined;

app.disable("x-powered-by");
app.use((request, response, next) => {
  const origin = request.headers.origin;
  if (origin && allowedOrigins.has(origin)) {
    response.setHeader("access-control-allow-origin", origin);
    response.setHeader("vary", "origin");
    response.setHeader("access-control-allow-headers", "content-type");
    response.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  }
  if (request.method === "OPTIONS") {
    response.sendStatus(204);
    return;
  }
  next();
});
app.use(express.json({ limit: "8kb" }));

function getApi() {
  apiPromise ??= Barretenberg.new({
    threads: Math.max(1, Number(process.env.PROVER_THREADS ?? 2)),
    logger: (message) => console.info(`[barretenberg] ${message}`),
  });
  return apiPromise;
}

function referenceToField(reference: string): string {
  const hex = createHash("sha256")
    .update(reference.trim().toLowerCase())
    .digest("hex");
  return (BigInt(`0x${hex}`) % fieldModulus).toString();
}

function toHex(bytes: Uint8Array): Hex {
  return `0x${Buffer.from(bytes).toString("hex")}`;
}

function asFieldHex(value: string): Hex {
  const normalized = value.startsWith("0x")
    ? value.slice(2)
    : BigInt(value).toString(16);
  return `0x${normalized.padStart(64, "0")}`;
}

async function createVerifiedAttestation(reportData: Buffer) {
  if (
    process.env.PHALA_CVM !== "true" &&
    !process.env.DSTACK_SIMULATOR_ENDPOINT
  ) {
    return {
      verified: false,
      environment: "local",
      message: "Remote attestation is available when this prover runs in Phala.",
    };
  }

  const { DstackClient } = await import("@phala/dstack-sdk");
  const client = new DstackClient();
  const quoteResult = await client.getQuote(reportData);
  const verificationResponse = await fetch(
    "https://cloud-api.phala.com/api/v1/attestations/verify",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hex: quoteResult.quote }),
      signal: AbortSignal.timeout(20_000),
    },
  );
  const verification =
    (await verificationResponse.json()) as AttestationVerification;
  if (!verificationResponse.ok) {
    throw new Error("Phala attestation verification service rejected the quote.");
  }

  const checksum = verification.checksum;
  return {
    verified:
      verification.success === true &&
      verification.quote?.verified !== false,
    environment: process.env.DSTACK_SIMULATOR_ENDPOINT
      ? "simulator"
      : "phala-cvm",
    checksum,
    teeType: verification.quote?.header?.tee_type,
    reportData:
      verification.quote?.body?.report_data ??
      verification.quote?.header?.user_data,
    mrtd: verification.quote?.body?.mrtd,
    rtmr0: verification.quote?.body?.rtmr0,
    verificationUrl: checksum
      ? `https://proof.t16z.com/reports/${checksum}`
      : undefined,
  };
}

const proofRequest = z.object({
  invoiceId: z.string().trim().min(1).max(128),
  invoiceValue: z.string().regex(/^[1-9]\d{0,5}$/),
  daysToMaturity: z.number().int().min(1).max(maxMaturityDays),
  salt: z.string().regex(/^[1-9]\d{0,76}$/).optional(),
});

app.get("/health", (_request, response) => {
  response.json({
    ok: true,
    service: "coven-confidential-prover",
    environment: process.env.DSTACK_SIMULATOR_ENDPOINT
      ? "simulator"
      : process.env.PHALA_CVM === "true"
        ? "phala-cvm"
        : "local",
    busy: proving,
    circuit: "invoice_policy",
    noir: "1.0.0-beta.24",
    barretenberg: "5.0.0-nightly.20260708",
  });
});

app.get("/attestation", async (_request, response) => {
  try {
    const { DstackClient } = await import("@phala/dstack-sdk");
    const client = new DstackClient();
    const challenge = createHash("sha256")
      .update(`coven:${Date.now()}`)
      .digest();
    response.json(await client.getQuote(challenge));
  } catch {
    response.status(503).json({
      error: "Attestation is available only inside a Phala CVM or simulator.",
    });
  }
});

app.get("/attestation/verified", async (_request, response) => {
  try {
    const challenge = createHash("sha256")
      .update(`coven-health:${Date.now()}`)
      .digest();
    response.setHeader("cache-control", "no-store");
    response.json(await createVerifiedAttestation(challenge));
  } catch (error) {
    response.status(503).json({
      verified: false,
      error:
        error instanceof Error
          ? error.message
          : "Attestation verification failed.",
    });
  }
});

app.post("/prove/invoice", async (request, response) => {
  const parsed = proofRequest.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid private invoice witness." });
    return;
  }
  if (BigInt(parsed.data.invoiceValue) > maxInvoiceValue) {
    response.status(400).json({
      error: "Face value must not exceed 100,000 aUSDC.",
    });
    return;
  }
  if (proving) {
    response
      .status(429)
      .setHeader("retry-after", "15")
      .json({ error: "The confidential prover is busy. Retry shortly." });
    return;
  }

  proving = true;
  const startedAt = Date.now();
  try {
    const circuit = circuitArtifact as unknown as Circuit;
    const noir = new Noir(circuit);
    const salt =
      parsed.data.salt ??
      (BigInt(`0x${randomBytes(31).toString("hex")}`) % fieldModulus).toString();
    const { witness } = await noir.execute({
      invoice_value: parsed.data.invoiceValue,
      days_to_maturity: parsed.data.daysToMaturity.toString(),
      invoice_id: referenceToField(parsed.data.invoiceId),
      salt,
      max_invoice_value: maxInvoiceValue.toString(),
      max_days_to_maturity: maxMaturityDays.toString(),
    });

    const api = await getApi();
    const backend = new UltraHonkBackend(circuit.bytecode, api);
    const proofData = await backend.generateProof(witness, {
      verifierTarget: "evm",
    });
    const verified = await backend.verifyProof(proofData, {
      verifierTarget: "evm",
    });
    const publicInputs = proofData.publicInputs.map(asFieldHex);
    if (!verified || publicInputs.length !== 4) {
      throw new Error("Generated proof did not pass local verification.");
    }
    const attestationBinding = createHash("sha256")
      .update(`${publicInputs[2]}:${publicInputs[3]}`)
      .digest();
    const attestation = await createVerifiedAttestation(
      attestationBinding,
    ).catch((error) => ({
      verified: false,
      environment:
        process.env.PHALA_CVM === "true" ? "phala-cvm" : "local",
      message:
        error instanceof Error
          ? error.message
          : "Attestation verification failed.",
    }));

    response.setHeader("cache-control", "no-store");
    response.json({
      proof: toHex(proofData.proof),
      publicInputs,
      commitment: publicInputs[2],
      nullifier: publicInputs[3],
      verifiedLocally: true,
      prover: "phala-tee",
      elapsedMs: Date.now() - startedAt,
      attestation,
    });
  } catch (error) {
    console.error(
      "Proof generation failed",
      error instanceof Error ? error.message : "unknown error",
    );
    response.status(500).json({ error: "Confidential proof generation failed." });
  } finally {
    proving = false;
  }
});

const server = app.listen(port, "0.0.0.0", () => {
  console.info(`Coven confidential prover listening on ${port}`);
});

async function shutdown() {
  server.close();
  if (apiPromise) {
    const api = await apiPromise.catch(() => undefined);
    await api?.destroy().catch(() => undefined);
  }
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
