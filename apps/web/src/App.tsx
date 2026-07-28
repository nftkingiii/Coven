import { FormEvent, useEffect, useState } from "react";
import type { BrowserProof } from "./remote-proof";
import { connectBrowserWallet, switchToMonadTestnet } from "./wallet";

const demoWallet = "0x1111111111111111111111111111111111111111";
const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8787";

type CviResult = {
  mode: string;
  status: number;
  tier: string;
  message?: string;
};

type IssuanceResult = {
  hash?: string;
  txHash?: string;
  address?: string;
  message?: string;
};

function short(value: string, head = 7, tail = 5) {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
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

function NetworkBadge({ active = true }: { active?: boolean }) {
  return (
    <span className={`network-badge ${active ? "" : "inactive"}`}>
      <i />
      {active ? "Monad testnet" : "Network not ready"}
    </span>
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
          <div className="hero-kicker">
            <NetworkBadge />
            <span>Cleanverse × Noir</span>
          </div>
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
        <div className="hero-proof">
          <span>Private execution</span>
          <strong>Phala TEE</strong>
          <i />
          <span>Public settlement</span>
          <strong>Monad</strong>
        </div>
      </section>

      <section className="trust-row" aria-label="Core technologies">
        <span>Powered by</span>
        <strong>Cleanverse CVI</strong>
        <strong>Noir ZK</strong>
        <strong>Cleanverse CVA</strong>
        <strong>Phala TEE</strong>
        <strong>Monad</strong>
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
  invoiceId,
  openIssuance,
}: {
  proof: BrowserProof | null;
  invoiceId: string;
  openIssuance: () => void;
}) {
  return (
    <section className="records-view">
      <div className="records-summary">
        <div>
          <p className="eyebrow">Proof registry</p>
          <h2>Private policy receipts</h2>
          <p>
            This view holds the public outputs produced by Coven. Invoice terms
            are intentionally absent.
          </p>
        </div>
        <div className="summary-stat">
          <span>Session proofs</span>
          <strong>{proof ? "01" : "00"}</strong>
        </div>
      </div>
      {proof ? (
        <article className="record-card">
          <div className="record-status"><CheckIcon /> Verified in Phala</div>
          <div>
            <span className="record-label">Invoice reference</span>
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
        </article>
      ) : (
        <div className="empty-records">
          <div className="proof-rings"><i /><i /><ShieldMark /></div>
          <h3>No proof receipts yet</h3>
          <p>
            Complete an issuance proof to see its commitment, nullifier,
            verification status, and eventual Monad transaction here.
          </p>
          <button className="button button-dark" onClick={openIssuance}>
            Generate a proof <ArrowIcon />
          </button>
        </div>
      )}
    </section>
  );
}

function AssetsView({
  issuance,
  invoiceId,
  faceValue,
  maturity,
  country,
  openIssuance,
}: {
  issuance: IssuanceResult | null;
  invoiceId: string;
  faceValue: string;
  maturity: string;
  country: string;
  openIssuance: () => void;
}) {
  const receipt =
    issuance?.txHash || issuance?.hash || issuance?.address || issuance?.message;
  return (
    <section className="records-view">
      <div className="records-summary">
        <div>
          <p className="eyebrow">CVA portfolio</p>
          <h2>Verified invoice assets</h2>
          <p>
            Assets appear only after Cleanverse accepts the policy-bound CVA
            issuance request.
          </p>
        </div>
        <div className="summary-stat">
          <span>Session assets</span>
          <strong>{issuance ? "01" : "00"}</strong>
        </div>
      </div>
      {issuance ? (
        <article className="asset-record">
          <div className="asset-record-mark">CVN</div>
          <div>
            <span className="record-label">Asset</span>
            <h3>{invoiceId}</h3>
            <p>{Number(faceValue).toLocaleString()} aUSDC · matures {maturity}</p>
          </div>
          <div>
            <span className="record-label">Transfer policy</span>
            <strong>CVI tier {country} · compliant holders</strong>
          </div>
          <div>
            <span className="record-label">Cleanverse receipt</span>
            <code title={receipt}>{short(receipt || "Accepted", 12, 8)}</code>
          </div>
          <span className="status-chip success">CVA prepared</span>
        </article>
      ) : (
        <div className="empty-records">
          <div className="asset-seal compact">
            <span>CVA</span>
            <div><CheckIcon /></div>
          </div>
          <h3>No issued CVAs yet</h3>
          <p>
            After a proof passes, the Cleanverse issuance response, asset
            status, amount, maturity, and transfer policy will appear here.
          </p>
          <button className="button button-dark" onClick={openIssuance}>
            Start an issuance <ArrowIcon />
          </button>
        </div>
      )}
    </section>
  );
}

export default function App() {
  const [view, setView] = useState<"landing" | "desk">(
    window.location.hash === "#desk" ? "desk" : "landing",
  );
  const [wallet, setWallet] = useState(demoWallet);
  const [invoiceId, setInvoiceId] = useState("CVN-2026-0042");
  const [faceValue, setFaceValue] = useState("85000");
  const [maturity, setMaturity] = useState("2026-10-30");
  const [country, setCountry] = useState("NG");
  const [cvi, setCvi] = useState<CviResult | null>(null);
  const [proof, setProof] = useState<BrowserProof | null>(null);
  const [issuance, setIssuance] = useState<IssuanceResult | null>(null);
  const [progress, setProgress] = useState("");
  const [busy, setBusy] = useState<"" | "wallet" | "network" | "cvi" | "proof" | "cva">("");
  const [error, setError] = useState("");
  const [walletError, setWalletError] = useState("");
  const [networkReady, setNetworkReady] = useState(false);
  const [deskTab, setDeskTab] = useState<DeskTab>("issuance");

  useEffect(() => {
    const syncView = () =>
      setView(window.location.hash === "#desk" ? "desk" : "landing");
    window.addEventListener("hashchange", syncView);
    return () => window.removeEventListener("hashchange", syncView);
  }, []);

  function openDesk() {
    window.location.hash = "desk";
    setView("desk");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function connectWallet() {
    setBusy("wallet");
    setError("");
    setWalletError("");
    try {
      const account = await connectBrowserWallet();
      setWallet(account);
      setCvi(null);
      setProof(null);
      setIssuance(null);
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
      if (!response.ok) throw new Error(result.error);
      setCvi(result);
      setProof(null);
      setIssuance(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Verification failed");
    } finally {
      setBusy("");
    }
  }

  async function generateProof(event: FormEvent) {
    event.preventDefault();
    setBusy("proof");
    setProof(null);
    setIssuance(null);
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
    try {
      const response = await fetch(`${apiUrl}/api/compliance/cva/launch`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chain: "monad",
          token_name: `Coven ${invoiceId}`,
          token_symbol: "CVN",
          decimals: 6,
          admin_address: wallet,
          icon: `${window.location.origin}/coven-icon.png`,
          rule: {
            allowed_group: "IN",
            allowed_sub_group: "",
            min_tier: Number(cvi?.tier || 1),
            min_sub_tier: 0,
            is_black_list: true,
            countries: [country],
          },
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setIssuance(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "CVA issuance failed");
    } finally {
      setBusy("");
    }
  }

  if (view === "landing") return <Landing openDesk={openDesk} />;

  const connected = wallet !== demoWallet;
  const currentStep = issuance ? 4 : proof ? 4 : cvi ? 2 : 1;

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
            <NetworkBadge active={networkReady} />
            {connected && !networkReady && (
              <button
                className="network-control"
                onClick={switchNetwork}
                disabled={!!busy}
              >
                {busy === "network" ? "Switching…" : "Switch to Monad"}
              </button>
            )}
            <button className="wallet-control" onClick={connectWallet} disabled={!!busy}>
              <span className={connected ? "wallet-dot connected" : "wallet-dot"} />
              {busy === "wallet"
                ? "Connecting…"
                : connected
                  ? short(wallet, 6, 4)
                  : "Connect wallet"}
            </button>
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
            invoiceId={invoiceId}
            openIssuance={() => setDeskTab("issuance")}
          />
        ) : deskTab === "assets" ? (
          <AssetsView
            issuance={issuance}
            invoiceId={invoiceId}
            faceValue={faceValue}
            maturity={maturity}
            country={country}
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
                  const done = number < currentStep || (number === 4 && !!issuance);
                  const active = number === currentStep && !issuance;
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
                    onChange={(event) => setWallet(event.target.value)}
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
                    <small>Tier {cvi.tier} · Monad · {cvi.mode} sandbox</small>
                  </div>
                  <span>CVI</span>
                </div>
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
                    Debtor country
                    <input
                      maxLength={2}
                      value={country}
                      onChange={(event) => setCountry(event.target.value.toUpperCase())}
                      required
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
                      <strong>Proof verified inside Phala</strong>
                      <small>Noir · UltraHonk · attested TEE</small>
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
                  </dl>
                  <button
                    className="button button-lime issue-button"
                    disabled={!proof.verifiedLocally || !!busy || !!issuance}
                    onClick={issueCva}
                  >
                    {busy === "cva"
                      ? "Requesting CVA…"
                      : issuance
                        ? "CVA issuance prepared"
                        : "Continue to CVA issuance"}
                    <ArrowIcon />
                  </button>
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
                  <p className="eyebrow">CVA response received</p>
                  <h3>Asset issuance prepared.</h3>
                  <p>{issuance.message || short(issuance.txHash || issuance.hash || issuance.address || "Cleanverse sandbox accepted the request.", 12, 8)}</p>
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
