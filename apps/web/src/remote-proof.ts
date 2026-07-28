export type InvoiceProofInput = {
  invoiceValue: string;
  daysToMaturity: number;
  invoiceId: string;
  salt: string;
};

export type BrowserProof = {
  proof: `0x${string}`;
  publicInputs: readonly `0x${string}`[];
  commitment: `0x${string}`;
  nullifier: `0x${string}`;
  verifiedLocally: boolean;
};

const proverUrl =
  import.meta.env.VITE_PROVER_URL?.replace(/\/$/, "") ??
  "http://localhost:8080";

export async function generateInvoiceProof(
  input: InvoiceProofInput,
  onProgress?: (message: string) => void,
): Promise<BrowserProof> {
  onProgress?.("Sending encrypted transport request to confidential prover");
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 420_000);

  try {
    onProgress?.("Generating proof inside the confidential prover");
    const response = await fetch(`${proverUrl}/prove/invoice`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      cache: "no-store",
      signal: controller.signal,
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(
        typeof result.error === "string"
          ? result.error
          : "Confidential proof generation failed.",
      );
    }
    onProgress?.("Proof verified by the confidential prover");
    return result as BrowserProof;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("The confidential prover timed out. Please try again.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}
