import { FormEvent, useEffect, useRef, useState } from "react";
import type { Address } from "viem";
import type { CvaActionReceipt, CvaSnapshot, InvestorHolding } from "./cva";
import type { BrowserProof } from "./remote-proof";
import type { RegistryReceipt } from "./registry";
import {
  connectBrowserWallet,
  disconnectBrowserWallet,
  signWalletMessage,
  switchToMonadTestnet,
} from "./wallet";

const disconnectedWallet = "";
const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8787";

type CviResult = {
  mode: string;
  status: number;
  tier: string;
  message?: string;
};

type CviChallenge = {
  address: Address;
  message: string;
  expiresAt: number;
};

type IssuanceResult = {
  requestId?: string;
  issueAssetId?: number;
  applyStatus?: "PENDING" | "APPROVED" | "ISSUING" | "ISSUED" | "REJECTED" | "ISSUE_FAILED";
  rejectReason?: string;
  issueErrorMsg?: string;
  atokenAddress?: string;
  issuedAt?: string;
  hash?: string;
  txHash?: string;
  address?: string;
  message?: string;
  [key: string]: unknown;
};

type TransferPreflight = {
  source: string;
  checkedAt: string;
  eligible: boolean;
  code?: number;
  message?: string;
  magickLink?: string;
};

function short(value: string, head = 7, tail = 5) {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function tokenSymbolForProof(nullifier: string) {
  const proofSuffix = nullifier.replace(/^0x/i, "").slice(-9).toUpperCase();
  return `CVN${proofSuffix}`;
}

function freshInvoiceId() {
  return `CVN-${Date.now().toString(36).toUpperCase()}`;
}

const assetAddressKeys = new Set([
  "address",
  "asset_address",
  "assetaddress",
  "atoken_address",
  "atokenaddress",
  "contract_address",
  "contractaddress",
  "token_address",
  "tokenaddress",
]);

function isEvmAddress(value: string): value is Address {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function findAssetAddress(
  value: unknown,
  excludedAddress?: string,
): Address | null {
  if (!value || typeof value !== "object") return null;
  for (const [key, nested] of Object.entries(value)) {
    if (
      typeof nested === "string" &&
      assetAddressKeys.has(key.toLowerCase()) &&
      isEvmAddress(nested) &&
      nested.toLowerCase() !== excludedAddress?.toLowerCase()
    ) {
      return nested;
    }
  }
  for (const nested of Object.values(value)) {
    const address = findAssetAddress(nested, excludedAddress);
    if (address) return address;
  }
  return null;
}

function registryConfigured() {
  const value = import.meta.env.VITE_COVEN_REGISTRY_ADDRESS;
  return Boolean(value && isEvmAddress(value));
}

function cleanverseReceipt(value: IssuanceResult | null) {
  if (!value) return "";
  for (const key of ["txHash", "requestId", "hash", "message"]) {
    if (typeof value[key] === "string") return value[key] as string;
  }
  return "Cleanverse sandbox accepted the CVA request.";
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 10h11M11 6l4 4-4 4" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="m5.5 10.2 3 3L15 6.8" />
    </svg>
  );
}

function ShieldMark() {
  return (
    <svg className="shield-mark" viewBox="0 0 36 36" aria-hidden="true">
      <path d="M18 3.8 30 8v8.7c0 7.3-4.7 12.5-12 15.5-7.3-3-12-8.2-12-15.5V8l12-4.2Z" />
      <path d="m12.5 18.2 3.4 3.4 7.7-8" />
    </svg>
  );
}

function Brand() {
  return (
    <a className="brand" href="#home" aria-label="Coven home">
      <img src="/coven-icon.png" alt="" />
      <span>COVEN</span>
    </a>
  );
}

const integrations = [
  { id: "cvi", name: "Cleanverse", product: "CVI", logo: "/integrations/cleanverse.png" },
  { id: "noir", name: "Noir", product: "Zero knowledge", logo: "/integrations/noir.png" },
  { id: "cva", name: "Cleanverse", product: "CVA", logo: "/integrations/cleanverse.png" },
  { id: "phala", name: "Phala", product: "TEE", logo: "/integrations/phala.svg" },
  { id: "monad", name: "Monad", product: "Settlement", logo: "/integrations/monad.svg" },
] as const;

function IntegrationSet({ duplicate = false }: { duplicate?: boolean }) {
  return (
    <div className="trust-set" aria-hidden={duplicate || undefined}>
      {integrations.map((integration) => (
        <div className={`trust-item trust-item-${integration.id}`} key={integration.id}>
          <img
            src={integration.logo}
            alt={duplicate ? "" : `${integration.name} logo`}
          />
          <span>{integration.product}</span>
        </div>
      ))}
    </div>
  );
}

function Landing({ openDesk }: { openDesk: () => void }) {
  return (
    <main className="landing" id="home">
      <header className="landing-nav">
        <Brand />
        <nav aria-label="Main navigation">
          <a href="#system">System</a>
          <a href="#privacy">Privacy</a>
          <a href="#technology">Technology</a>
        </nav>
        <button className="nav-cta" onClick={openDesk}>
          Open issuance desk <ArrowIcon />
        </button>
      </header>

      <section className="hero-card">
        <img className="hero-art" src="/coven-hero.png" alt="" />
        <div className="hero-copy">
          <h1>
            Verified assets.
            <br />
            <em>Private terms.</em>
          </h1>
          <p>
            Coven turns verified trade invoices into compliant, financeable
            assets—without publishing their commercial terms on-chain.
          </p>
          <div className="hero-actions">
            <button className="button button-dark" onClick={openDesk}>
              Start an issuance <ArrowIcon />
            </button>
            <a className="text-link" href="#privacy">
              See the privacy model
            </a>
          </div>
        </div>
      </section>

      <section className="trust-row" aria-label="Core technologies">
        <span className="trust-label">Powered by</span>
        <div className="trust-marquee">
          <div className="trust-track">
            <IntegrationSet />
            <IntegrationSet duplicate />
          </div>
        </div>
      </section>

      <section className="system-section" id="system">
        <div className="section-intro">
          <p className="eyebrow">One trusted issuance path</p>
          <h2>Compliance that proves enough—and reveals nothing extra.</h2>
        </div>
        <div className="system-grid">
          <article className="feature-card feature-identity">
            <span className="feature-number">01</span>
            <div className="identity-orbit">
              <div><ShieldMark /></div>
              <i />
              <i />
            </div>
            <div>
              <p className="eyebrow">Verified issuer</p>
              <h3>Identity is a condition, not a disclosure.</h3>
              <p>
                Cleanverse CVI confirms the wallet is eligible before any asset
                can enter the issuance flow.
              </p>
            </div>
          </article>
          <article className="feature-card feature-private" id="privacy">
            <span className="feature-number">02</span>
            <div className="private-window">
              <span>Invoice value</span>
              <strong>••••••••</strong>
              <span>Maturity</span>
              <strong>•• / •• / ••••</strong>
              <div><i /> Protected in a TEE</div>
            </div>
            <div>
              <p className="eyebrow">Private policy proof</p>
              <h3>Terms stay confidential. Compliance travels.</h3>
              <p>
                An attested Phala prover checks value and maturity limits with
                Noir. Only the proof, commitment, nullifier, and policy result
                return for settlement.
              </p>
            </div>
          </article>
          <article className="feature-card feature-asset" id="technology">
            <span className="feature-number">03</span>
            <div className="asset-seal">
              <span>CVA</span>
              <div><CheckIcon /></div>
              <small>Ready to settle</small>
            </div>
            <div>
              <p className="eyebrow">Compliant asset</p>
              <h3>A verified invoice becomes programmable.</h3>
              <p>
                CVA issuance carries eligibility and transfer rules into the
                asset lifecycle on Monad.
              </p>
            </div>
          </article>
        </div>
      </section>

      <section className="landing-cta">
        <div>
          <p className="eyebrow">From private invoice to trusted asset</p>
          <h2>Issue with proof, not exposure.</h2>
        </div>
        <button className="button button-lime" onClick={openDesk}>
          Open Coven <ArrowIcon />
        </button>
      </section>

      <footer>
        <Brand />
        <p>Private RWA infrastructure for verified markets.</p>
        <span>Built for Cleanverse Build · 2026</span>
      </footer>
    </main>
  );
}

type DeskTab = "issuance" | "proofs" | "assets";

function ProofsView({
  proof,
  registryReceipt,
  registryHistory,
  historyBusy,
  historyError,
  invoiceId,
  openIssuance,
}: {
  proof: BrowserProof | null;
  registryReceipt: RegistryReceipt | null;
  registryHistory: RegistryReceipt[];
  historyBusy: boolean;
  historyError: string;
  invoiceId: string;
  openIssuance: () => void;
}) {
  const historicalReceipts = registryHistory.filter(
    (record) => record.transactionHash !== registryReceipt?.transactionHash,
  );
  const receiptCount = historicalReceipts.length + (proof ? 1 : 0);

  return (
    <section className="records-view">
      <div className="records-summary">
        <div>
          <p className="eyebrow">Proof registry</p>
          <h2>Private policy receipts</h2>
          <p>
            Public proof outputs and confirmed registry records appear here.
            Private invoice terms are intentionally absent.
          </p>
        </div>
        <div className="summary-stat">
          <span>Evidence records</span>
          <strong>{String(receiptCount).padStart(2, "0")}</strong>
        </div>
      </div>

      {proof && (
        <article className="record-card">
          <div className="record-status">
            <CheckIcon />
            {proof.attestation?.verified
              ? "Proof and TEE attestation verified"
              : "Proof verified · TEE evidence unavailable"}
          </div>
          <div>
            <span className="record-label">Session reference</span>
            <strong>{invoiceId}</strong>
          </div>
          <div>
            <span className="record-label">Commitment</span>
            <code title={proof.commitment}>{short(proof.commitment, 12, 8)}</code>
          </div>
          <div>
            <span className="record-label">Nullifier</span>
            <code title={proof.nullifier}>{short(proof.nullifier, 12, 8)}</code>
          </div>
          <div>
            <span className="record-label">Proof system</span>
            <strong>Noir · UltraHonk</strong>
          </div>
          <div>
            <span className="record-label">Execution evidence</span>
            {proof.attestation?.verificationUrl ? (
              <a
                className="receipt-link"
                href={proof.attestation.verificationUrl}
                target="_blank"
                rel="noreferrer"
              >
                {proof.attestation.teeType || "TEE"} attestation report
              </a>
            ) : (
              <strong>{proof.attestation?.message || "Local prover"}</strong>
            )}
          </div>
          <div>
            <span className="record-label">Monad status</span>
            {registryReceipt ? (
              <a
                className="receipt-link"
                href={registryReceipt.explorerUrl}
                target="_blank"
                rel="noreferrer"
              >
                Confirmed in block {registryReceipt.blockNumber}
              </a>
            ) : (
              <strong>Not registered</strong>
            )}
          </div>
        </article>
      )}

      {historicalReceipts.map((record) => (
        <article className="record-card historical-record" key={record.transactionHash}>
          <div className="record-status"><CheckIcon /> Registered on Monad</div>
          <div>
            <span className="record-label">Commitment</span>
            <code title={record.commitment}>{short(record.commitment, 12, 8)}</code>
          </div>
          <div>
            <span className="record-label">Nullifier</span>
            <code title={record.nullifier}>{short(record.nullifier, 12, 8)}</code>
          </div>
          <div>
            <span className="record-label">CVA contract</span>
            <code title={record.assetAddress}>{short(record.assetAddress, 12, 8)}</code>
          </div>
          <div>
            <span className="record-label">Registered</span>
            <strong>{new Date(record.issuedAt * 1000).toLocaleString()}</strong>
          </div>
          <div>
            <span className="record-label">Monad receipt</span>
            <a className="receipt-link" href={record.explorerUrl} target="_blank" rel="noreferrer">
              Confirmed in block {record.blockNumber}
            </a>
          </div>
        </article>
      ))}

      {historyBusy && <p className="records-inline-state">Reading Monad registry records…</p>}
      {historyError && <p className="records-inline-state warning">{historyError}</p>}
      {!proof && historicalReceipts.length === 0 && !historyBusy && (
        <div className="empty-records">
          <div className="proof-rings"><i /><i /><ShieldMark /></div>
          <h3>No proof receipts yet</h3>
          <p>
            Generate a proof or connect a wallet with existing registry records
            to see its public evidence here.
          </p>
          <button className="button button-dark" onClick={openIssuance}>
            Generate a proof <ArrowIcon />
          </button>
        </div>
      )}
    </section>
  );
}

function TransferPreflightPanel({ assetAddress }: { assetAddress?: Address }) {
  const [recipient, setRecipient] = useState("");
  const [result, setResult] = useState<TransferPreflight | null>(null);
  const [checking, setChecking] = useState(false);
  const [preflightError, setPreflightError] = useState("");

  async function checkRecipient(event: FormEvent) {
    event.preventDefault();
    setResult(null);
    setPreflightError("");
    if (!assetAddress) return;
    if (!isEvmAddress(recipient)) {
      setPreflightError("Enter a valid EVM recipient address.");
      return;
    }
    setChecking(true);
    try {
      const response = await fetch(`${apiUrl}/api/compliance/transfer/preflight`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chain: "monad",
          atoken: assetAddress,
          address: recipient,
        }),
      });
      const payload = (await response.json()) as TransferPreflight & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Eligibility check failed.");
      setResult(payload);
    } catch (caught) {
      setPreflightError(
        caught instanceof Error ? caught.message : "Eligibility check failed.",
      );
    } finally {
      setChecking(false);
    }
  }

  return (
    <section className="preflight-card">
      <div>
        <p className="eyebrow">Cleanverse compliance preflight</p>
        <h3>Can this wallet receive the CVA?</h3>
        <p>
          Check the recipient’s A-Pass transfer eligibility before submitting
          any asset transfer.
        </p>
      </div>
      <form onSubmit={checkRecipient}>
        <label htmlFor="recipient-wallet">Recipient wallet</label>
        <div>
          <input
            id="recipient-wallet"
            placeholder="0x…"
            value={recipient}
            onChange={(event) => setRecipient(event.target.value.trim())}
            disabled={!assetAddress || checking}
            spellCheck={false}
          />
          <button className="button button-dark" disabled={!assetAddress || checking}>
            {checking ? "Checking…" : "Check eligibility"}
          </button>
        </div>
      </form>
      {!assetAddress && (
        <p className="inline-note">An issued CVA contract is required for this check.</p>
      )}
      {preflightError && <p className="preflight-result blocked">{preflightError}</p>}
      {result && (
        <div className={result.eligible ? "preflight-result allowed" : "preflight-result blocked"}>
          <strong>{result.eligible ? "Transfer allowed" : "Transfer blocked"}</strong>
          <span>{result.message || `Cleanverse status code ${result.code ?? "unknown"}`}</span>
          <small>
            {result.source} · {new Date(result.checkedAt).toLocaleString()}
          </small>
          {result.magickLink && (
            <a href={result.magickLink} target="_blank" rel="noreferrer">
              Open Cleanverse identity flow
            </a>
          )}
        </div>
      )}
      <small className="preflight-disclaimer">
        This performs the documented verify_apass check only. No transfer is submitted.
      </small>
    </section>
  );
}

type InvestorPosition = {
  record: RegistryReceipt;
  holding: InvestorHolding;
};

function InvestorPortfolio({
  wallet,
  records,
  registryLoading,
  registryNotice,
}: {
  wallet: string;
  records: RegistryReceipt[];
  registryLoading: boolean;
  registryNotice: string;
}) {
  const [positions, setPositions] = useState<InvestorPosition[]>([]);
  const [registeredCount, setRegisteredCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [portfolioError, setPortfolioError] = useState("");
  const [portfolioNotice, setPortfolioNotice] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const connected = isEvmAddress(wallet);

  useEffect(() => {
    let cancelled = false;
    if (!connected) {
      setPositions([]);
      setRegisteredCount(0);
      setPortfolioError("");
      setPortfolioNotice("");
      return;
    }
    if (registryLoading) {
      setLoading(true);
      return;
    }
    if (registryNotice && records.length === 0) {
      setPositions([]);
      setRegisteredCount(0);
      setPortfolioError(registryNotice);
      setPortfolioNotice("");
      setLoading(false);
      return;
    }
    setLoading(true);
    setPortfolioError("");
    setPortfolioNotice(registryNotice);
    const uniqueRecords = records.filter(
      (record, index, records) =>
        records.findIndex(
          (candidate) =>
            candidate.assetAddress.toLowerCase() ===
            record.assetAddress.toLowerCase(),
        ) === index,
    );
    setRegisteredCount(uniqueRecords.length);
    void Promise.allSettled(
      uniqueRecords.map(async (record) => {
        const { readInvestorHolding } = await import("./cva");
        const holding = await readInvestorHolding(record.assetAddress, wallet);
        return { record, holding } satisfies InvestorPosition;
      }),
    )
      .then((results) => {
        if (cancelled) return;
        const discovered = results
          .filter(
            (result): result is PromiseFulfilledResult<InvestorPosition> =>
              result.status === "fulfilled" && Number(result.value.holding.balance) > 0,
          )
          .map((result) => result.value);
        setPositions(discovered);
      })
      .catch((caught) => {
        if (!cancelled) {
          setPositions([]);
          setPortfolioError(
            caught instanceof Error ? caught.message : "Investor portfolio could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [connected, records, refreshKey, registryLoading, registryNotice, wallet]);

  return (
    <section className="investor-portfolio">
      <div className="investor-portfolio-head">
        <div>
          <p className="eyebrow">Investor portfolio</p>
          <h3>My verified holdings</h3>
          <p>
            Live CVA balances and acquisition receipts reconstructed from Monad.
          </p>
        </div>
        <button
          className="portfolio-refresh"
          type="button"
          disabled={!connected || loading}
          onClick={() => setRefreshKey((value) => value + 1)}
        >
          {loading ? "Scanning…" : "Refresh portfolio"}
        </button>
      </div>

      {portfolioNotice && (
        <p className="records-inline-state warning">{portfolioNotice}</p>
      )}

      {!connected ? (
        <div className="portfolio-empty compact">
          <strong>Connect the investor wallet</strong>
          <span>Coven will discover its CVA balances without an import step.</span>
        </div>
      ) : loading ? (
        <div className="portfolio-empty compact">
          <strong>Reading registered CVAs</strong>
          <span>Checking this wallet’s live CVA balances.</span>
        </div>
      ) : portfolioError ? (
        <div className="portfolio-empty compact warning">
          <strong>Portfolio temporarily unavailable</strong>
          <span>{portfolioError}</span>
        </div>
      ) : positions.length === 0 ? (
        <div className="portfolio-empty compact">
          <strong>No CVA participation units found</strong>
          <span>
            Scanned {registeredCount} registered {registeredCount === 1 ? "asset" : "assets"} for {short(wallet, 8, 6)}.
          </span>
        </div>
      ) : (
        <div className="portfolio-grid">
          {positions.map(({ record, holding }) => (
            <article className="portfolio-position" key={record.assetAddress}>
              <div className="portfolio-position-mark">{holding.symbol.slice(0, 3)}</div>
              <div className="portfolio-position-title">
                <span>Verified participation</span>
                <h4>{holding.name}</h4>
                <code title={record.assetAddress}>{short(record.assetAddress, 10, 7)}</code>
              </div>
              <div className="portfolio-balance">
                <span>Investor balance</span>
                <strong>{holding.balance}</strong>
                <small>{holding.symbol} units</small>
              </div>
              <div>
                <span className="record-label">Issuer</span>
                <code title={record.issuer}>{short(record.issuer, 8, 6)}</code>
              </div>
              <div>
                <span className="record-label">Position evidence</span>
                {holding.latestTransfer ? (
                  <a
                    className="receipt-link"
                    href={holding.latestTransfer.explorerUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    +{holding.latestTransfer.amount} units · receipt
                  </a>
                ) : (
                  <strong>Balance confirmed</strong>
                )}
              </div>
              <span className="status-chip success">Held by this wallet</span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function CvaFinancingDesk({
  assetAddress,
  wallet,
}: {
  assetAddress?: Address;
  wallet: string;
}) {
  const [recipient, setRecipient] = useState("");
  const [checkedRecipient, setCheckedRecipient] = useState("");
  const [amount, setAmount] = useState("100");
  const [eligibility, setEligibility] = useState<TransferPreflight | null>(null);
  const [snapshot, setSnapshot] = useState<CvaSnapshot | null>(null);
  const [actionReceipt, setActionReceipt] = useState<CvaActionReceipt | null>(null);
  const [action, setAction] = useState<
    "" | "read" | "eligibility" | "activate" | "mint" | "transfer"
  >("");
  const [actionStatus, setActionStatus] = useState("");
  const [deskError, setDeskError] = useState("");

  async function refreshSnapshot(recipientAddress?: Address) {
    if (!assetAddress || !isEvmAddress(wallet)) {
      setSnapshot(null);
      return;
    }
    const { readCvaSnapshot } = await import("./cva");
    setSnapshot(await readCvaSnapshot(assetAddress, wallet, recipientAddress));
  }

  useEffect(() => {
    let cancelled = false;
    if (!assetAddress || !isEvmAddress(wallet)) {
      setSnapshot(null);
      return;
    }
    setAction("read");
    setDeskError("");
    void import("./cva")
      .then(({ readCvaSnapshot }) => readCvaSnapshot(assetAddress, wallet))
      .then((nextSnapshot) => {
        if (!cancelled) setSnapshot(nextSnapshot);
      })
      .catch(() => {
        if (!cancelled) setDeskError("CVA contract details could not be read from Monad.");
      })
      .finally(() => {
        if (!cancelled) setAction("");
      });
    return () => {
      cancelled = true;
    };
  }, [assetAddress, wallet]);

  function updateRecipient(value: string) {
    setRecipient(value.trim());
    setCheckedRecipient("");
    setEligibility(null);
    setActionReceipt(null);
    setDeskError("");
  }

  async function checkInvestor(event: FormEvent) {
    event.preventDefault();
    setEligibility(null);
    setCheckedRecipient("");
    setDeskError("");
    if (!assetAddress) return;
    if (!isEvmAddress(recipient)) {
      setDeskError("Enter a valid EVM investor address.");
      return;
    }
    if (recipient.toLowerCase() === wallet.toLowerCase()) {
      setDeskError("Use a different wallet for the investor allocation.");
      return;
    }
    setAction("eligibility");
    setActionStatus("Checking the investor's Cleanverse identity");
    try {
      const response = await fetch(`${apiUrl}/api/compliance/transfer/preflight`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chain: "monad",
          atoken: assetAddress,
          address: recipient,
        }),
      });
      const payload = (await response.json()) as TransferPreflight & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Eligibility check failed.");
      setEligibility(payload);
      setCheckedRecipient(recipient.toLowerCase());
      await refreshSnapshot(recipient);
    } catch (caught) {
      setDeskError(caught instanceof Error ? caught.message : "Eligibility check failed.");
    } finally {
      setAction("");
      setActionStatus("");
    }
  }

  async function activateMinting() {
    if (!assetAddress || !isEvmAddress(wallet)) return;
    setAction("activate");
    setDeskError("");
    setActionReceipt(null);
    try {
      const { activateCvaMinting } = await import("./cva");
      await activateCvaMinting(assetAddress, wallet, setActionStatus);
      await refreshSnapshot();
    } catch (caught) {
      if (!(caught instanceof Error && caught.name === "WalletActionCancelledError")) {
        setDeskError(caught instanceof Error ? caught.message : "Minting activation failed.");
      }
    } finally {
      setAction("");
      setActionStatus("");
    }
  }

  async function mintUnits() {
    if (!assetAddress || !isEvmAddress(wallet) || !snapshot) return;
    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      setDeskError("Enter a participation-unit amount greater than zero.");
      return;
    }
    setAction("mint");
    setDeskError("");
    setActionReceipt(null);
    try {
      const { mintCvaUnits } = await import("./cva");
      const receipt = await mintCvaUnits(
        assetAddress,
        wallet,
        amount,
        snapshot.decimals,
        setActionStatus,
      );
      setActionReceipt(receipt);
      await refreshSnapshot();
    } catch (caught) {
      if (!(caught instanceof Error && caught.name === "WalletActionCancelledError")) {
        setDeskError(caught instanceof Error ? caught.message : "CVA minting failed.");
      }
    } finally {
      setAction("");
      setActionStatus("");
    }
  }

  async function transferUnits() {
    if (
      !assetAddress ||
      !isEvmAddress(wallet) ||
      !isEvmAddress(recipient) ||
      !snapshot ||
      !eligibility?.eligible ||
      checkedRecipient !== recipient.toLowerCase()
    ) return;
    setAction("transfer");
    setDeskError("");
    setActionReceipt(null);
    try {
      const { transferCvaUnits } = await import("./cva");
      const receipt = await transferCvaUnits(
        assetAddress,
        wallet,
        recipient,
        amount,
        snapshot.decimals,
        setActionStatus,
      );
      setActionReceipt(receipt);
      await refreshSnapshot(recipient);
    } catch (caught) {
      if (!(caught instanceof Error && caught.name === "WalletActionCancelledError")) {
        setDeskError(caught instanceof Error ? caught.message : "CVA transfer failed.");
      }
    } finally {
      setAction("");
      setActionStatus("");
    }
  }

  const amountIsValid = Number.isFinite(Number(amount)) && Number(amount) > 0;
  const hasEnoughUnits = Boolean(
    snapshot && amountIsValid && Number(snapshot.walletBalance) >= Number(amount),
  );
  const investorIsEligible = Boolean(
    eligibility?.eligible && checkedRecipient === recipient.toLowerCase(),
  );

  return (
    <section className="financing-desk">
      <div className="financing-head">
        <div>
          <p className="eyebrow">Investor financing desk</p>
          <h3>Distribute the verified claim.</h3>
          <p>
            Activate supply, verify the investor through Cleanverse, and allocate
            CVA participation units. RuleV2 is enforced again by the token itself.
          </p>
        </div>
        <span className={assetAddress ? "status-chip success" : "status-chip"}>
          {assetAddress ? "Live CVA" : "Waiting for asset"}
        </span>
      </div>

      <div className="cva-metrics" aria-live="polite">
        <div>
          <span>Asset</span>
          <strong>{snapshot?.symbol || (action === "read" ? "Reading…" : "—")}</strong>
          <small>{snapshot?.name || "Cleanverse verified asset"}</small>
        </div>
        <div>
          <span>Total supply</span>
          <strong>{snapshot ? `${snapshot.totalSupply} units` : "—"}</strong>
          <small>Invoice value remains private</small>
        </div>
        <div>
          <span>Issuer balance</span>
          <strong>{snapshot ? `${snapshot.walletBalance} units` : "—"}</strong>
          <small>{snapshot?.hasMinterRole ? "Mint authority active" : "Mint authority inactive"}</small>
        </div>
        <div>
          <span>Investor balance</span>
          <strong>
            {snapshot?.recipientBalance === undefined
              ? "Check investor"
              : `${snapshot.recipientBalance} units`}
          </strong>
          <small>Monad read-back after allocation</small>
        </div>
      </div>

      <div className="financing-steps">
        <section>
          <span className="step-number">01</span>
          <div>
            <h4>Prepare participation supply</h4>
            <p>Activate the documented MINTER_ROLE once, without publishing the invoice face value.</p>
          </div>
          {!snapshot?.hasMinterRole ? (
            <button
              className="button button-outline"
              type="button"
              disabled={!snapshot?.hasAdminRole || !!action}
              onClick={activateMinting}
            >
              {action === "activate" ? actionStatus || "Activating…" : "Activate minting"}
            </button>
          ) : (
            <span className="step-state complete"><CheckIcon /> Active</span>
          )}
        </section>

        <section>
          <span className="step-number">02</span>
          <div>
            <h4>Verify the investor</h4>
            <p>Cleanverse checks the recipient’s A-Pass against this CVA policy.</p>
          </div>
          <form onSubmit={checkInvestor}>
            <label htmlFor="financing-investor-wallet">Investor wallet</label>
            <div>
              <input
                id="financing-investor-wallet"
                placeholder="0x…"
                value={recipient}
                onChange={(event) => updateRecipient(event.target.value)}
                disabled={!assetAddress || !!action}
                spellCheck={false}
              />
              <button className="button button-dark" disabled={!assetAddress || !!action}>
                {action === "eligibility" ? "Checking…" : "Check CVI"}
              </button>
            </div>
          </form>
        </section>

        <section>
          <span className="step-number">03</span>
          <div>
            <h4>Allocate the verified claim</h4>
            <p>Mint the required units, then transfer them through the CVA’s live RuleV2 gate.</p>
          </div>
          <div className="allocation-control">
            <label htmlFor="allocation-amount">Participation units</label>
            <div>
              <input
                id="allocation-amount"
                inputMode="decimal"
                value={amount}
                onChange={(event) => {
                  setAmount(event.target.value.replace(/[^0-9.]/g, ""));
                  setActionReceipt(null);
                  setDeskError("");
                }}
                disabled={!!action}
              />
              {!hasEnoughUnits ? (
                <button
                  className="button button-outline"
                  type="button"
                  disabled={!snapshot?.hasMinterRole || !amountIsValid || !!action}
                  onClick={mintUnits}
                >
                  {action === "mint" ? actionStatus || "Minting…" : `Mint ${amount || "units"}`}
                </button>
              ) : (
                <button
                  className="button button-lime"
                  type="button"
                  disabled={!investorIsEligible || !!action}
                  onClick={transferUnits}
                >
                  {action === "transfer" ? actionStatus || "Transferring…" : "Transfer to investor"}
                </button>
              )}
            </div>
          </div>
        </section>
      </div>

      {deskError && <p className="financing-result blocked">{deskError}</p>}
      {eligibility && checkedRecipient === recipient.toLowerCase() && (
        <div className={eligibility.eligible ? "financing-result allowed" : "financing-result blocked"}>
          <strong>{eligibility.eligible ? "Investor eligible" : "Investor blocked"}</strong>
          <span>{eligibility.message || `Cleanverse status code ${eligibility.code ?? "unknown"}`}</span>
          <small>{eligibility.source} · {new Date(eligibility.checkedAt).toLocaleString()}</small>
          {eligibility.magickLink && (
            <a href={eligibility.magickLink} target="_blank" rel="noreferrer">
              Open Cleanverse identity flow
            </a>
          )}
        </div>
      )}
      {actionReceipt && (
        <div className="financing-result confirmed">
          <strong>Monad action confirmed</strong>
          <span>Read-back completed in block {actionReceipt.blockNumber}.</span>
          <a href={actionReceipt.explorerUrl} target="_blank" rel="noreferrer">View transaction</a>
        </div>
      )}
      <small className="financing-disclaimer">
        This sandbox flow allocates the compliant CVA claim. It does not move an
        investor payment; a settlement-token rail can be attached separately.
      </small>
    </section>
  );
}

function AssetsView({
  issuance,
  registryReceipt,
  registryHistory,
  historyBusy,
  historyError,
  invoiceId,
  faceValue,
  maturity,
  investorCountry,
  wallet,
  openIssuance,
}: {
  issuance: IssuanceResult | null;
  registryReceipt: RegistryReceipt | null;
  registryHistory: RegistryReceipt[];
  historyBusy: boolean;
  historyError: string;
  invoiceId: string;
  faceValue: string;
  maturity: string;
  investorCountry: string;
  wallet: string;
  openIssuance: () => void;
}) {
  const receipt = cleanverseReceipt(issuance);
  const records = [
    ...(registryReceipt ? [registryReceipt] : []),
    ...registryHistory.filter(
      (record) => record.transactionHash !== registryReceipt?.transactionHash,
    ),
  ];
  const selectedAsset = registryReceipt?.assetAddress || records[0]?.assetAddress;

  return (
    <section className="records-view">
      <div className="records-summary">
        <div>
          <p className="eyebrow">CVA portfolio</p>
          <h2>Verified invoice assets</h2>
          <p>
            Only CVAs with confirmed Monad registry evidence appear as
            registered assets.
          </p>
        </div>
        <div className="summary-stat">
          <span>Registered assets</span>
          <strong>{String(records.length).padStart(2, "0")}</strong>
        </div>
      </div>

      <InvestorPortfolio
        wallet={wallet}
        records={records}
        registryLoading={historyBusy}
        registryNotice={historyError}
      />

      {records.map((record, index) => {
        const isCurrent = record.transactionHash === registryReceipt?.transactionHash;
        return (
          <article className="asset-record" key={record.transactionHash}>
            <div className="asset-record-mark">CVN</div>
            <div>
              <span className="record-label">Asset</span>
              <h3>{isCurrent ? invoiceId : short(record.assetAddress, 12, 8)}</h3>
              <p>
                {isCurrent
                  ? `${Number(faceValue).toLocaleString()} aUSDC · matures ${maturity}`
                  : `Registered ${new Date(record.issuedAt * 1000).toLocaleDateString()}`}
              </p>
            </div>
            <div>
              <span className="record-label">Transfer policy</span>
              <strong>
                {isCurrent
                  ? `CVI-gated · tier ≥ 20${investorCountry ? ` · ${investorCountry}` : ""}`
                  : "CVI-gated holders"}
              </strong>
            </div>
            <div>
              <span className="record-label">{isCurrent ? "Cleanverse request" : "CVA contract"}</span>
              <code title={isCurrent ? receipt : record.assetAddress}>
                {short(isCurrent ? receipt || "Issued" : record.assetAddress, 12, 8)}
              </code>
            </div>
            <div>
              <span className="record-label">Monad receipt</span>
              <a
                className="receipt-link"
                href={record.explorerUrl}
                target="_blank"
                rel="noreferrer"
                title={record.transactionHash}
              >
                {short(record.transactionHash, 12, 8)}
              </a>
            </div>
            <span className="status-chip success">
              {index === 0 ? "Issued & registered" : "Registered"}
            </span>
          </article>
        );
      })}

      {historyBusy && <p className="records-inline-state">Reading Monad registry records…</p>}
      {historyError && <p className="records-inline-state warning">{historyError}</p>}
      {records.length === 0 && !historyBusy && (
        <div className="empty-records">
          <div className="asset-seal compact">
            <span>CVA</span>
            <div><CheckIcon /></div>
          </div>
          <h3>
            {issuance
              ? `Cleanverse status: ${issuance.applyStatus || "PENDING"}`
              : "No registered CVAs yet"}
          </h3>
          <p>
            {issuance
              ? "The issuance application is preserved. Return to Issuance to resume status polling and registration without submitting it twice."
              : "After a proof passes, the issued CVA and confirmed Monad registry receipt will appear here."}
          </p>
          <button className="button button-dark" onClick={openIssuance}>
            {issuance ? "Resume issuance" : "Start an issuance"} <ArrowIcon />
          </button>
        </div>
      )}

      <CvaFinancingDesk assetAddress={selectedAsset} wallet={wallet} />
    </section>
  );
}

export default function App() {
  const [view, setView] = useState<"landing" | "desk">(
    window.location.hash === "#desk" ? "desk" : "landing",
  );
  const [wallet, setWallet] = useState(disconnectedWallet);
  const [invoiceId, setInvoiceId] = useState(freshInvoiceId);
  const [faceValue, setFaceValue] = useState("85000");
  const [maturity, setMaturity] = useState("2026-10-30");
  const [investorCountry, setInvestorCountry] = useState("");
  const [cvi, setCvi] = useState<CviResult | null>(null);
  const [cviMissing, setCviMissing] = useState(false);
  const [cviProgress, setCviProgress] = useState("");
  const [proof, setProof] = useState<BrowserProof | null>(null);
  const [issuance, setIssuance] = useState<IssuanceResult | null>(null);
  const [registryReceipt, setRegistryReceipt] =
    useState<RegistryReceipt | null>(null);
  const [registryHistory, setRegistryHistory] = useState<RegistryReceipt[]>([]);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [progress, setProgress] = useState("");
  const [issuanceProgress, setIssuanceProgress] = useState("");
  const [busy, setBusy] = useState<
    "" | "wallet" | "network" | "cvi" | "cvi-enroll" | "proof" | "cva"
  >("");
  const [error, setError] = useState("");
  const [walletError, setWalletError] = useState("");
  const [networkReady, setNetworkReady] = useState(false);
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const [deskTab, setDeskTab] = useState<DeskTab>("issuance");
  const walletMenuRef = useRef<HTMLDivElement>(null);
  const walletButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const syncView = () =>
      setView(window.location.hash === "#desk" ? "desk" : "landing");
    window.addEventListener("hashchange", syncView);
    return () => window.removeEventListener("hashchange", syncView);
  }, []);

  useEffect(() => {
    if (!walletMenuOpen) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!walletMenuRef.current?.contains(event.target as Node)) {
        setWalletMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setWalletMenuOpen(false);
        walletButtonRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [walletMenuOpen]);

  useEffect(() => {
    let cancelled = false;
    if (!registryConfigured()) {
      setRegistryHistory([]);
      setHistoryError("");
      return;
    }

    setHistoryBusy(true);
    setHistoryError("");
    void fetch(`${apiUrl}/api/registry/assets`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const result = (await response.json()) as {
          records?: RegistryReceipt[];
          error?: string;
          stale?: boolean;
          warning?: string;
        };
        if (!response.ok || !result.records) {
          throw new Error(result.error || "Registry history could not be read.");
        }
        return result;
      })
      .then((result) => {
        if (!cancelled) {
          setRegistryHistory(result.records || []);
          setHistoryError(
            result.stale
              ? result.warning || "Registry history may be delayed."
              : "",
          );
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setRegistryHistory([]);
          setHistoryError(
            "Registry history is temporarily unavailable. Your confirmed receipt is unaffected; retry after refreshing.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setHistoryBusy(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function openDesk() {
    window.location.hash = "desk";
    setView("desk");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function connectWallet() {
    setWalletMenuOpen(false);
    setBusy("wallet");
    setError("");
    setWalletError("");
    try {
      const account = await connectBrowserWallet();
      setWallet(account);
      setCvi(null);
      setCviMissing(false);
      setCviProgress("");
      setProof(null);
      setIssuance(null);
      setRegistryReceipt(null);
      try {
        await switchToMonadTestnet();
        setNetworkReady(true);
      } catch (caught) {
        setNetworkReady(false);
        setWalletError(
          `Account connected. ${
            caught instanceof Error ? caught.message : "Switch to Monad Testnet to continue."
          }`,
        );
      }
    } catch (caught) {
      setWalletError(
        caught instanceof Error ? caught.message : "Wallet connection failed",
      );
    } finally {
      setBusy("");
    }
  }

  function disconnectWallet() {
    disconnectBrowserWallet();
    setWallet(disconnectedWallet);
    setNetworkReady(false);
    setWalletMenuOpen(false);
    setCvi(null);
    setCviMissing(false);
    setCviProgress("");
    setProof(null);
    setIssuance(null);
    setRegistryReceipt(null);
    setProgress("");
    setIssuanceProgress("");
    setError("");
    setWalletError("");
    setBusy("");
  }

  async function switchNetwork() {
    setBusy("network");
    setWalletError("");
    try {
      await switchToMonadTestnet();
      setNetworkReady(true);
    } catch (caught) {
      setNetworkReady(false);
      setWalletError(
        caught instanceof Error ? caught.message : "Network switching failed",
      );
    } finally {
      setBusy("");
    }
  }

  async function verifyIdentity() {
    setBusy("cvi");
    setError("");
    try {
      const response = await fetch(`${apiUrl}/api/compliance/cvi`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chain: "monad", address: wallet }),
      });
      const result = await response.json();
      if (response.status === 404 && result.code === "CVI_NOT_FOUND") {
        setCvi(null);
        setCviMissing(true);
        setCviProgress("");
        setProof(null);
        setIssuance(null);
        setRegistryReceipt(null);
        return;
      }
      if (!response.ok) throw new Error(result.error);
      setCvi(result);
      setCviMissing(false);
      setCviProgress("");
      setProof(null);
      setIssuance(null);
      setRegistryReceipt(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Verification failed");
    } finally {
      setBusy("");
    }
  }

  async function enrollIdentity() {
    if (!isEvmAddress(wallet)) return;
    setBusy("cvi-enroll");
    setError("");
    setCviProgress("Preparing a secure wallet-ownership request");
    try {
      const challengeResponse = await fetch(
        `${apiUrl}/api/compliance/cvi/challenge`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ address: wallet }),
        },
      );
      const challenge = (await challengeResponse.json()) as
        | CviChallenge
        | { error?: string };
      if (!challengeResponse.ok || !("message" in challenge)) {
        const challengeError =
          "error" in challenge ? challenge.error : undefined;
        throw new Error(challengeError || "CVI enrollment could not start.");
      }

      setCviProgress("Sign the ownership message in your wallet");
      const signature = await signWalletMessage(challenge.message, wallet);
      setCviProgress("Cleanverse is issuing the sandbox CVI");
      const enrollmentResponse = await fetch(
        `${apiUrl}/api/compliance/cvi/enroll`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ address: wallet, signature }),
        },
      );
      const enrollment = await enrollmentResponse.json();
      if (!enrollmentResponse.ok) {
        throw new Error(enrollment.error || "Cleanverse CVI enrollment failed.");
      }

      setCviProgress("Waiting for the Cleanverse CVI record on Monad");
      for (let attempt = 0; attempt < 15; attempt += 1) {
        const lookupResponse = await fetch(`${apiUrl}/api/compliance/cvi`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ chain: "monad", address: wallet }),
        });
        const result = await lookupResponse.json();
        if (lookupResponse.ok) {
          setCvi(result);
          setCviMissing(false);
          setCviProgress("Cleanverse CVI active");
          setProof(null);
          setIssuance(null);
          setRegistryReceipt(null);
          return;
        }
        if (lookupResponse.status !== 404) {
          throw new Error(result.error || "CVI status lookup failed.");
        }
        await new Promise((resolve) => window.setTimeout(resolve, 2_000));
      }
      throw new Error(
        "Cleanverse accepted the CVI request, but confirmation is still pending. Check CVI again shortly.",
      );
    } catch (caught) {
      setCviProgress("");
      setError(caught instanceof Error ? caught.message : "CVI enrollment failed");
    } finally {
      setBusy("");
    }
  }

  async function generateProof(event: FormEvent) {
    event.preventDefault();
    setBusy("proof");
    setProof(null);
    setIssuance(null);
    setRegistryReceipt(null);
    setError("");
    try {
      const daysToMaturity = Math.ceil(
        (new Date(`${maturity}T00:00:00Z`).getTime() - Date.now()) / 86_400_000,
      );
      if (daysToMaturity <= 0) throw new Error("Maturity must be in the future.");
      if (daysToMaturity > 180) throw new Error("Maturity must be within 180 days.");
      if (Number(faceValue) > 100_000) throw new Error("Face value must not exceed 100,000 aUSDC.");
      const saltBytes = crypto.getRandomValues(new Uint8Array(31));
      const salt = BigInt(
        `0x${Array.from(saltBytes, (byte) =>
          byte.toString(16).padStart(2, "0"),
        ).join("")}`,
      ).toString();
      const { generateInvoiceProof } = await import("./remote-proof");
      const result = await generateInvoiceProof(
        { invoiceId, invoiceValue: faceValue, daysToMaturity, salt },
        setProgress,
      );
      setProof(result);
      setProgress("Proof verified inside the Phala TEE");
    } catch (caught) {
      setProgress("");
      setError(caught instanceof Error ? caught.message : "Proof generation failed");
    } finally {
      setBusy("");
    }
  }

  async function issueCva() {
    if (!proof?.verifiedLocally) return;
    setBusy("cva");
    setError("");
    setIssuanceProgress("");
    try {
      if (!registryConfigured()) {
        throw new Error(
          "CovenRegistry is ready in the codebase but has not been deployed. Set VITE_COVEN_REGISTRY_ADDRESS after the final Monad deployment.",
        );
      }

      const { assertIssuanceReady, registerCvaOnMonad } =
        await import("./registry");
      setIssuanceProgress("Checking CCP identity and replay protection on Monad");
      await assertIssuanceReady(wallet as Address, proof.nullifier);

      let acceptedIssuance = issuance;
      if (!acceptedIssuance) {
        setIssuanceProgress("Submitting the policy-bound CVA application");
        const launch = {
          chain: "monad" as const,
          token_name: `Coven ${invoiceId}`,
          token_symbol: tokenSymbolForProof(proof.nullifier),
          decimals: 6,
          admin_address: wallet,
          icon: `${window.location.origin}/coven-icon.png`,
          rule: {
            allowed_group: "",
            allowed_sub_group: "",
            min_tier: 20,
            min_sub_tier: 0,
            is_black_list: false as const,
            countries: investorCountry ? [investorCountry] : [],
          },
        };
        const challengeResponse = await fetch(
          `${apiUrl}/api/compliance/cva/launch/challenge`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ launch }),
          },
        );
        const challenge = (await challengeResponse.json()) as CviChallenge & {
          challengeId?: string;
          error?: string;
        };
        if (!challengeResponse.ok) {
          throw new Error(challenge.error || "CVA authorization could not start.");
        }
        setIssuanceProgress("Confirming this one-time CVA launch in your wallet");
        const signature = await signWalletMessage(
          challenge.message,
          wallet as Address,
        );
        if (!challenge.challengeId) {
          throw new Error("CVA authorization did not return a challenge ID.");
        }
        const response = await fetch(`${apiUrl}/api/compliance/cva/launch`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            launch,
            challengeId: challenge.challengeId,
            signature,
          }),
        });
        const result = (await response.json()) as IssuanceResult;
        if (!response.ok) {
          throw new Error(
            typeof result.error === "string"
              ? result.error
              : "Cleanverse CVA issuance failed",
          );
        }
        acceptedIssuance = result;
        setIssuance(result);
      }

      if (!acceptedIssuance.requestId) {
        throw new Error(
          "Cleanverse did not return an issuance request ID, so Coven cannot safely track or retry this application.",
        );
      }

      let issued = acceptedIssuance;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        if (attempt > 0) await sleep(3_000);
        setIssuanceProgress(
          `Cleanverse status: ${issued.applyStatus || "PENDING"} · checking again`,
        );
        const statusResponse = await fetch(
          `${apiUrl}/api/compliance/cva/status/${encodeURIComponent(acceptedIssuance.requestId)}`,
          { cache: "no-store" },
        );
        const status = (await statusResponse.json()) as IssuanceResult;
        if (!statusResponse.ok) {
          throw new Error(
            typeof status.error === "string"
              ? status.error
              : "Cleanverse issuance status could not be read.",
          );
        }
        issued = { ...issued, ...status };
        setIssuance(issued);
        if (issued.applyStatus === "ISSUED") break;
        if (issued.applyStatus === "REJECTED") {
          throw new Error(
            issued.rejectReason || "Cleanverse rejected the CVA application.",
          );
        }
        if (issued.applyStatus === "ISSUE_FAILED") {
          throw new Error(
            issued.issueErrorMsg || "Cleanverse could not issue the CVA.",
          );
        }
      }

      if (issued.applyStatus !== "ISSUED") {
        throw new Error(
          "Cleanverse is still processing this application. Retry to resume status polling; Coven will not submit it twice.",
        );
      }

      const assetAddress = findAssetAddress(issued, wallet);
      if (!assetAddress) {
        throw new Error(
          "Cleanverse marked the application issued but did not return its A-Token contract address. The request is preserved and will not be submitted twice.",
        );
      }

      const receipt = await registerCvaOnMonad({
        account: wallet as Address,
        assetAddress,
        proof,
        onStatus: setIssuanceProgress,
      });
      setRegistryReceipt(receipt);
      setRegistryHistory((records) => [
        receipt,
        ...records.filter(
          (record) => record.transactionHash !== receipt.transactionHash,
        ),
      ]);
      setIssuanceProgress("CVA issued and registered on Monad");
    } catch (caught) {
      if (caught instanceof Error && caught.name === "WalletActionCancelledError") {
        setIssuanceProgress("");
      } else {
        setError(caught instanceof Error ? caught.message : "CVA issuance failed");
      }
    } finally {
      setBusy("");
    }
  }

  function startNewIssuance() {
    setInvoiceId(freshInvoiceId());
    setProof(null);
    setIssuance(null);
    setRegistryReceipt(null);
    setProgress("");
    setIssuanceProgress("");
    setError("");
    setDeskTab("issuance");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (view === "landing") return <Landing openDesk={openDesk} />;

  const connected = isEvmAddress(wallet);
  const currentStep = registryReceipt ? 4 : proof ? 4 : cvi ? 2 : 1;

  return (
    <main className="desk-shell">
      <aside className="sidebar">
        <Brand />
        <nav aria-label="Desk navigation">
          <button
            className={deskTab === "issuance" ? "active" : ""}
            onClick={() => setDeskTab("issuance")}
          >
            <span className="nav-icon">⌂</span> Issuance
          </button>
          <button
            className={deskTab === "proofs" ? "active" : ""}
            onClick={() => setDeskTab("proofs")}
          >
            <span className="nav-icon">◇</span> Proofs
          </button>
          <button
            className={deskTab === "assets" ? "active" : ""}
            onClick={() => setDeskTab("assets")}
          >
            <span className="nav-icon">◎</span> Assets
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-note">
            <ShieldMark />
            <strong>Confidential proving boundary</strong>
            <p>Invoice terms travel over HTTPS only to the attested Phala CVM.</p>
          </div>
          <a className="back-link" href="#home">← Back to overview</a>
        </div>
      </aside>

      <section className="desk-main">
        <header className="desk-header">
          <div>
            <h1>
              {deskTab === "issuance"
                ? "New private issuance"
                : deskTab === "proofs"
                  ? "Proof receipts"
                  : "Verified assets"}
            </h1>
          </div>
          <div className="desk-actions">
            {connected && !networkReady && (
              <button
                className="network-control"
                onClick={switchNetwork}
                disabled={!!busy}
              >
                {busy === "network" ? "Switching…" : "Switch to Monad"}
              </button>
            )}
            <div className="wallet-menu" ref={walletMenuRef}>
              <button
                className="wallet-control"
                ref={walletButtonRef}
                onClick={() =>
                  connected
                    ? setWalletMenuOpen((open) => !open)
                    : void connectWallet()
                }
                disabled={!!busy}
                aria-haspopup={connected ? "menu" : undefined}
                aria-expanded={connected ? walletMenuOpen : undefined}
                aria-controls={connected ? "wallet-account-menu" : undefined}
              >
                <span className={connected ? "wallet-dot connected" : "wallet-dot"} />
                {busy === "wallet"
                  ? "Connecting…"
                  : connected
                    ? short(wallet, 6, 4)
                    : "Connect wallet"}
                {connected && <span className="wallet-chevron" aria-hidden="true">⌄</span>}
              </button>
              {connected && walletMenuOpen && (
                <div
                  className="wallet-dropdown"
                  id="wallet-account-menu"
                  role="menu"
                  aria-label="Wallet account"
                >
                  <div className="wallet-dropdown-account">
                    <span>Connected wallet</span>
                    <strong>{short(wallet, 8, 6)}</strong>
                  </div>
                  <div className="wallet-dropdown-network">
                    <span className={networkReady ? "wallet-dot connected" : "wallet-dot"} />
                    <span>{networkReady ? "Monad Testnet" : "Network not ready"}</span>
                  </div>
                  <button
                    className="wallet-disconnect"
                    type="button"
                    role="menuitem"
                    onClick={disconnectWallet}
                  >
                    Disconnect wallet
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <nav className="mobile-tabs" aria-label="Mobile desk navigation">
          {(["issuance", "proofs", "assets"] as DeskTab[]).map((tab) => (
            <button
              key={tab}
              className={deskTab === tab ? "active" : ""}
              onClick={() => setDeskTab(tab)}
            >
              {tab}
            </button>
          ))}
        </nav>

        {walletError && (
          <div className="wallet-alert" role="alert">
            <div>
              <strong>Wallet not connected</strong>
              <span>{walletError}</span>
            </div>
            <button onClick={() => setWalletError("")} aria-label="Dismiss wallet error">
              ×
            </button>
          </div>
        )}

        {deskTab === "proofs" ? (
          <ProofsView
            proof={proof}
            registryReceipt={registryReceipt}
            registryHistory={registryHistory}
            historyBusy={historyBusy}
            historyError={historyError}
            invoiceId={invoiceId}
            openIssuance={() => setDeskTab("issuance")}
          />
        ) : deskTab === "assets" ? (
          <AssetsView
            issuance={issuance}
            registryReceipt={registryReceipt}
            registryHistory={registryHistory}
            historyBusy={historyBusy}
            historyError={historyError}
            invoiceId={invoiceId}
            faceValue={faceValue}
            maturity={maturity}
            investorCountry={investorCountry}
            wallet={wallet}
            openIssuance={() => setDeskTab("issuance")}
          />
        ) : (
        <div className="desk-grid">
          <section className="flow-card">
            <div className="flow-heading">
              <div>
                <p className="eyebrow">Issuance run</p>
                <h2>Verify, prove, issue.</h2>
              </div>
              <span className="run-id">CVN / 0042</span>
            </div>

            <div className="stepper" aria-label={`Step ${currentStep} of 4`}>
              {["Verify issuer", "Add invoice", "Generate proof", "Issue CVA"].map(
                (label, index) => {
                  const number = index + 1;
                  const done =
                    number < currentStep || (number === 4 && !!registryReceipt);
                  const active = number === currentStep && !registryReceipt;
                  return (
                    <div className={done ? "done" : active ? "active" : ""} key={label}>
                      <span>{done ? <CheckIcon /> : number}</span>
                      <small>{label}</small>
                    </div>
                  );
                },
              )}
            </div>

            <div className="identity-block">
              <div className="block-title">
                <span>01</span>
                <div>
                  <h3>Verify the issuer</h3>
                  <p>Confirm this wallet holds an active Cleanverse identity.</p>
                </div>
                {cvi && <span className="status-chip success">Verified</span>}
              </div>
              <div className="wallet-field">
                <label htmlFor="wallet">Issuer wallet</label>
                <div>
                  <input
                    id="wallet"
                    value={wallet}
                    readOnly
                    placeholder="Connect wallet to continue"
                    spellCheck={false}
                  />
                  <button
                    className="button button-outline"
                    disabled={!!busy || !networkReady}
                    onClick={verifyIdentity}
                  >
                    {busy === "cvi"
                      ? "Checking…"
                      : !networkReady
                        ? "Switch network first"
                        : cvi
                          ? "Check again"
                          : "Check CVI"}
                  </button>
                </div>
              </div>
              {cvi && (
                <div className="attestation">
                  <div className="attestation-icon"><CheckIcon /></div>
                  <div>
                    <strong>Active Cleanverse identity</strong>
                    <small>Tier {cvi.tier} · Monad · API eligibility preview</small>
                  </div>
                  <span>CVI</span>
                </div>
              )}
              {cviMissing && (
                <div className="cvi-onboarding">
                  <div>
                    <strong>No Cleanverse CVI found</strong>
                    <p>
                      Create a sandbox identity for this wallet through Cleanverse,
                      then continue the live issuance flow.
                    </p>
                  </div>
                  <button
                    className="button button-dark"
                    disabled={!!busy || !networkReady}
                    onClick={enrollIdentity}
                    type="button"
                  >
                    {busy === "cvi-enroll" ? "Creating CVIâ€¦" : "Create sandbox CVI"}
                  </button>
                  <small>
                    Sandbox only. Your wallet signs an ownership message; no transaction
                    or production KYC claim is created by Coven.
                  </small>
                </div>
              )}
              {cviProgress && <p className="cvi-progress">{cviProgress}</p>}
              {cvi && (
                <p className="inline-note">
                  {registryConfigured()
                    ? "CovenRegistry will run the official on-chain CCP RuleV2 check before any CVA request."
                    : "The official on-chain CCP RuleV2 gate activates when CovenRegistry is deployed and configured."}
                </p>
              )}
              {cvi?.message && <p className="inline-note">{cvi.message}</p>}
            </div>

            <form onSubmit={generateProof} className={!cvi ? "form-locked" : ""}>
              <div className="block-title">
                <span>02</span>
                <div>
                  <h3>Add private invoice terms</h3>
                  <p>These inputs are sent to the confidential prover to create the proof witness.</p>
                </div>
                <span className="status-chip private">Private</span>
              </div>
              <fieldset disabled={!cvi || !!busy}>
                <div className="form-grid">
                  <label>
                    Invoice reference
                    <input
                      value={invoiceId}
                      onChange={(event) => setInvoiceId(event.target.value)}
                      required
                    />
                  </label>
                  <label>
                    Face value
                    <div className="input-affix">
                      <input
                        type="number"
                        min="1"
                        max="100000"
                        value={faceValue}
                        onChange={(event) => setFaceValue(event.target.value)}
                        required
                      />
                      <span>aUSDC</span>
                    </div>
                  </label>
                  <label>
                    Maturity date
                    <input
                      type="date"
                      value={maturity}
                      onChange={(event) => setMaturity(event.target.value)}
                      required
                    />
                  </label>
                  <label>
                    Eligible holder country
                    <input
                      maxLength={2}
                      value={investorCountry}
                      onChange={(event) =>
                        setInvestorCountry(
                          event.target.value.replace(/[^a-z]/gi, "").toUpperCase(),
                        )
                      }
                      pattern="[A-Z]{2}"
                      placeholder="Optional, e.g. NG"
                      title="Optional two-letter ISO country code for eligible CVA holders"
                    />
                  </label>
                </div>

                <div className="policy-panel">
                  <div>
                    <span className="policy-icon"><CheckIcon /></span>
                    <p><strong>Value policy</strong><small>≤ 100,000 aUSDC</small></p>
                  </div>
                  <div>
                    <span className="policy-icon"><CheckIcon /></span>
                    <p><strong>Maturity policy</strong><small>≤ 180 days</small></p>
                  </div>
                  <div>
                    <span className="policy-icon"><CheckIcon /></span>
                    <p><strong>Replay protection</strong><small>Unique nullifier</small></p>
                  </div>
                  <div>
                    <span className="policy-icon"><CheckIcon /></span>
                    <p>
                      <strong>Holder policy</strong>
                      <small>
                        Tier ≥ 20
                        {investorCountry ? ` · ${investorCountry}` : " · any country"}
                      </small>
                    </p>
                  </div>
                </div>

                <button className="button button-dark submit-proof" type="submit">
                  <span>
                    {busy === "proof" ? progress || "Preparing proof…" : "Generate private proof"}
                  </span>
                  <ArrowIcon />
                </button>
              </fieldset>
            </form>

            {error && (
              <div className="error-message" role="alert">
                <strong>Action could not be completed</strong>
                <span>{error}</span>
                <button onClick={() => setError("")} aria-label="Dismiss error">×</button>
              </div>
            )}
          </section>

          <aside className="receipt-column">
            <section className="receipt-card">
              <div className="receipt-head">
                <p className="eyebrow">Live proof receipt</p>
                <span className={proof ? "status-chip success" : "status-chip"}>
                  {proof ? "Ready" : "Waiting"}
                </span>
              </div>
              {!proof ? (
                <div className="empty-proof">
                  <div className="proof-rings"><i /><i /><ShieldMark /></div>
                  <h3>Your public receipt appears here.</h3>
                  <p>
                    Verify the issuer and generate a proof. Commercial terms
                    are not logged, persisted, or published on-chain.
                  </p>
                </div>
              ) : (
                <div className="proof-result">
                  <div className="proof-success">
                    <span><CheckIcon /></span>
                    <div>
                      <strong>
                        {proof.attestation?.verified
                          ? "Proof and TEE attestation verified"
                          : "Proof verified by the confidential prover"}
                      </strong>
                      <small>
                        Noir · UltraHonk ·{" "}
                        {proof.attestation?.verified
                          ? proof.attestation.teeType || "attested TEE"
                          : "attestation unavailable"}
                      </small>
                    </div>
                  </div>
                  <dl>
                    <div>
                      <dt>Commitment</dt>
                      <dd title={proof.commitment}>{short(proof.commitment, 11, 8)}</dd>
                    </div>
                    <div>
                      <dt>Nullifier</dt>
                      <dd title={proof.nullifier}>{short(proof.nullifier, 11, 8)}</dd>
                    </div>
                    <div>
                      <dt>Private fields disclosed</dt>
                      <dd>0</dd>
                    </div>
                    <div>
                      <dt>TEE evidence</dt>
                      <dd>
                        {proof.attestation?.verificationUrl ? (
                          <a
                            className="receipt-link"
                            href={proof.attestation.verificationUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Verify report
                          </a>
                        ) : (
                          proof.attestation?.message || "Unavailable"
                        )}
                      </dd>
                    </div>
                  </dl>
                  <button
                    className="button button-lime issue-button"
                    disabled={!proof.verifiedLocally || !!busy || !!registryReceipt}
                    onClick={issueCva}
                  >
                    {busy === "cva"
                      ? issuanceProgress || "Preparing issuance…"
                      : registryReceipt
                        ? "Issued and registered"
                        : issuance
                          ? issuance.applyStatus === "ISSUED"
                            ? "Complete Monad registration"
                            : "Resume issuance status"
                          : "Issue CVA and register"}
                    <ArrowIcon />
                  </button>
                  {!registryConfigured() && (
                    <p className="registry-note">
                      Monad registration activates after the final registry
                      deployment address is configured.
                    </p>
                  )}
                </div>
              )}
            </section>

            <section className="boundary-card">
              <div className="boundary-visual">
                <span>PRIVATE</span>
                <i />
                <span>PUBLIC</span>
              </div>
              <h3>The privacy boundary</h3>
              <div className="boundary-lists">
                <div>
                  <strong>Stays here</strong>
                  <span>Invoice ID</span>
                  <span>Face value</span>
                  <span>Maturity</span>
                </div>
                <div>
                  <strong>Goes on-chain</strong>
                  <span>Commitment</span>
                  <span>Nullifier</span>
                  <span>Policy result</span>
                </div>
              </div>
            </section>

            {issuance && (
              <section className="issuance-card">
                <span><CheckIcon /></span>
                <div>
                  <p className="eyebrow">
                    {registryReceipt
                      ? "Monad confirmation received"
                      : `Cleanverse application ${issuance.applyStatus || "PENDING"}`}
                  </p>
                  <h3>
                    {registryReceipt
                      ? "CVA issued and registered."
                      : issuance.applyStatus === "ISSUED"
                        ? "CVA issued. Registration pending."
                        : "CVA application saved. Status tracking can resume."}
                  </h3>
                  {registryReceipt ? (
                    <div className="issuance-actions">
                      <a
                        className="receipt-link"
                        href={registryReceipt.explorerUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View confirmed Monad transaction
                      </a>
                      <button className="button button-dark" onClick={startNewIssuance}>
                        Issue another CVA <ArrowIcon />
                      </button>
                    </div>
                  ) : (
                    <p>{short(cleanverseReceipt(issuance), 12, 8)}</p>
                  )}
                </div>
              </section>
            )}
          </aside>
        </div>
        )}
      </section>
    </main>
  );
}
