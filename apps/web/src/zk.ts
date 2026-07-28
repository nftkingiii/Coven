import { Barretenberg, BackendType, UltraHonkBackend } from "@aztec/bb.js";
import { Noir } from "@noir-lang/noir_js";
import circuitArtifact from "./invoice_policy.json";

export type InvoiceProofInput = {
  invoiceValue: string;
  daysToMaturity: number;
  invoiceId: string;
  salt: string;
};

const FIELD_MODULUS =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

export type BrowserProof = {
  proof: `0x${string}`;
  publicInputs: readonly `0x${string}`[];
  commitment: `0x${string}`;
  nullifier: `0x${string}`;
  verifiedLocally: boolean;
};

const MAX_INVOICE_VALUE = "100000";
const MAX_MATURITY_DAYS = "180";

function isWasmTrap(error: unknown): boolean {
  return (
    error instanceof WebAssembly.RuntimeError ||
    (error instanceof Error && error.message.trim().toLowerCase() === "unreachable")
  );
}

function toHex(bytes: Uint8Array): `0x${string}` {
  return `0x${Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")}`;
}

function asFieldHex(value: string): `0x${string}` {
  const normalized = value.startsWith("0x")
    ? value.slice(2)
    : BigInt(value).toString(16);
  return `0x${normalized.padStart(64, "0")}`;
}

async function referenceToField(reference: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(reference.trim().toLowerCase()),
  );
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return (BigInt(`0x${hex}`) % FIELD_MODULUS).toString();
}

export async function generateInvoiceProof(
  input: InvoiceProofInput,
  onProgress?: (message: string) => void,
): Promise<BrowserProof> {
  if (BigInt(input.invoiceValue) > BigInt(MAX_INVOICE_VALUE)) {
    throw new Error(`Face value must not exceed ${Number(MAX_INVOICE_VALUE).toLocaleString()} aUSDC.`);
  }
  if (input.daysToMaturity > Number(MAX_MATURITY_DAYS)) {
    throw new Error(`Maturity must be within ${MAX_MATURITY_DAYS} days.`);
  }

  onProgress?.("Solving private invoice witness");
  const circuit = circuitArtifact as unknown as ConstructorParameters<
    typeof Noir
  >[0];
  const invoiceIdField = await referenceToField(input.invoiceId);
  const noir = new Noir(circuit);
  const { witness } = await noir.execute({
    invoice_value: input.invoiceValue,
    days_to_maturity: input.daysToMaturity.toString(),
    invoice_id: invoiceIdField,
    salt: input.salt,
    max_invoice_value: MAX_INVOICE_VALUE,
    max_days_to_maturity: MAX_MATURITY_DAYS,
  });

  async function proveOnce(): Promise<BrowserProof> {
    onProgress?.("Loading local proving engine");
    const api = await Barretenberg.new({ backend: BackendType.Wasm, threads: 1 });

    try {
      const backend = new UltraHonkBackend(circuit.bytecode, api);
      onProgress?.("Generating zero-knowledge proof");
      const proofData = await backend.generateProof(witness, { verifierTarget: "evm" });
      onProgress?.("Verifying proof locally");
      const verifiedLocally = await backend.verifyProof(proofData, { verifierTarget: "evm" });
      const publicInputs = proofData.publicInputs.map(asFieldHex);
      if (publicInputs.length !== 4) {
        throw new Error(`Expected four application public inputs, received ${publicInputs.length}.`);
      }
      return { proof: toHex(proofData.proof), publicInputs, commitment: publicInputs[2], nullifier: publicInputs[3], verifiedLocally };
    } finally {
      await api.destroy().catch((error: unknown) => console.warn("Prover cleanup failed", error));
    }
  }

  try {
    return await proveOnce();
  } catch (error) {
    if (!isWasmTrap(error)) throw error;
    onProgress?.("Prover restarted after a browser WASM interruption");
    await new Promise((resolve) => window.setTimeout(resolve, 250));
    try {
      return await proveOnce();
    } catch (retryError) {
      if (!isWasmTrap(retryError)) throw retryError;
      throw new Error("The browser stopped the local prover twice. Close memory-heavy tabs, refresh this page, and try once more.");
    }
  }
}
