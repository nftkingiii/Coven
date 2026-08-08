import {
  createPublicClient,
  createWalletClient,
  custom,
  getAddress,
  http,
  isAddress,
  type Address,
  type Hex,
} from "viem";
import type { BrowserProof } from "./remote-proof";
import { activeWalletProvider, monadTestnet, switchToMonadTestnet } from "./wallet";

const registryAbi = [
  { type: "error", name: "InvalidProof", inputs: [] },
  { type: "error", name: "InvalidPublicInputs", inputs: [] },
  { type: "error", name: "PolicyMismatch", inputs: [] },
  { type: "error", name: "NullifierAlreadyUsed", inputs: [] },
  {
    type: "function",
    name: "issue",
    stateMutability: "nonpayable",
    inputs: [
      { name: "proof", type: "bytes" },
      { name: "publicInputs", type: "bytes32[]" },
      { name: "asset", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "usedNullifiers",
    stateMutability: "view",
    inputs: [{ name: "nullifier", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "isIssuerCompliant",
    stateMutability: "view",
    inputs: [{ name: "issuer", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "issuances",
    stateMutability: "view",
    inputs: [{ name: "nullifier", type: "bytes32" }],
    outputs: [
      { name: "commitment", type: "bytes32" },
      { name: "issuer", type: "address" },
      { name: "asset", type: "address" },
      { name: "issuedAt", type: "uint64" },
    ],
  },
  {
    type: "event",
    name: "InvoiceIssued",
    inputs: [
      { name: "nullifier", type: "bytes32", indexed: true },
      { name: "commitment", type: "bytes32", indexed: true },
      { name: "issuer", type: "address", indexed: true },
      { name: "asset", type: "address", indexed: false },
    ],
  },
] as const;

export type RegistryReceipt = {
  transactionHash: Hex;
  registryAddress: Address;
  assetAddress: Address;
  commitment: Hex;
  nullifier: Hex;
  issuer: Address;
  issuedAt: number;
  blockNumber: string;
  explorerUrl: string;
};

type RegistryIssuanceEvent = {
  transactionHash: Hex;
  blockNumber: bigint;
  args: {
    asset: Address;
    commitment: Hex;
    nullifier: Hex;
    issuer: Address;
  };
};

type ProviderError = Error & {
  code?: number;
  shortMessage?: string;
  cause?: ProviderError;
};

class WalletActionCancelledError extends Error {
  constructor() {
    super("Wallet action cancelled.");
    this.name = "WalletActionCancelledError";
  }
}

function configuredRegistryAddress(): Address {
  const value = import.meta.env.VITE_COVEN_REGISTRY_ADDRESS;
  if (!value || !isAddress(value)) {
    throw new Error(
      "CovenRegistry is not deployed yet. Add its Monad Testnet address to VITE_COVEN_REGISTRY_ADDRESS, then restart the app.",
    );
  }
  return getAddress(value);
}

export function registryConfigured() {
  const value = import.meta.env.VITE_COVEN_REGISTRY_ADDRESS;
  return Boolean(value && isAddress(value));
}

function registryPublicClient() {
  return createPublicClient({
    chain: monadTestnet,
    transport: http(monadTestnet.rpcUrls.default.http[0]),
  });
}

function registryHistoryClient() {
  const historyRpcUrl =
    import.meta.env.VITE_MONAD_HISTORY_RPC_URL ||
    "https://monad-testnet.drpc.org";
  return createPublicClient({
    chain: monadTestnet,
    transport: http(historyRpcUrl),
  });
}

function registryDeploymentBlock() {
  const value = import.meta.env.VITE_COVEN_REGISTRY_DEPLOYMENT_BLOCK;
  if (!value || !/^\d+$/.test(value)) return 0n;
  return BigInt(value);
}

const registryLogBlockWindow = 1_000n;

export async function assertIssuanceReady(account: Address, nullifier: Hex) {
  const registryAddress = configuredRegistryAddress();
  const publicClient = registryPublicClient();
  const [used, compliant] = await Promise.all([
    publicClient.readContract({
      address: registryAddress,
      abi: registryAbi,
      functionName: "usedNullifiers",
      args: [nullifier],
    }),
    publicClient.readContract({
      address: registryAddress,
      abi: registryAbi,
      functionName: "isIssuerCompliant",
      args: [account],
    }),
  ]);
  if (used) {
    throw new Error(
      "This invoice proof is already registered on Monad, so Coven stopped before requesting another CVA.",
    );
  }
  if (!compliant) {
    throw new Error(
      "The official Cleanverse CCP validator rejected this issuer for Coven's on-chain RuleV2 policy.",
    );
  }
}

export async function loadRegistryReceipts(
  account: Address,
): Promise<RegistryReceipt[]> {
  const registryAddress = configuredRegistryAddress();
  const publicClient = registryPublicClient();
  const historyClient = registryHistoryClient();
  const fromBlock = registryDeploymentBlock();
  const latestBlock = await publicClient.getBlockNumber();
  const ranges: Array<{ fromBlock: bigint; toBlock: bigint }> = [];

  for (let start = fromBlock; start <= latestBlock; start += registryLogBlockWindow) {
    const end = start + registryLogBlockWindow - 1n;
    ranges.push({
      fromBlock: start,
      toBlock: end < latestBlock ? end : latestBlock,
    });
  }

  const eventChunks: RegistryIssuanceEvent[][] = [];
  for (const { fromBlock: chunkStart, toBlock: chunkEnd } of ranges) {
    const chunk = await historyClient.getContractEvents({
      address: registryAddress,
      abi: registryAbi,
      eventName: "InvoiceIssued",
      args: { issuer: account },
      fromBlock: chunkStart,
      toBlock: chunkEnd,
      strict: true,
    });
    eventChunks.push(chunk as RegistryIssuanceEvent[]);
  }
  const logs = eventChunks.flat();

  const receipts = await Promise.all(
    logs.map(async (log) => {
      const block = await publicClient.getBlock({
        blockNumber: log.blockNumber,
      });
      return {
        transactionHash: log.transactionHash,
        registryAddress,
        assetAddress: log.args.asset,
        commitment: log.args.commitment,
        nullifier: log.args.nullifier,
        issuer: log.args.issuer,
        issuedAt: Number(block.timestamp),
        blockNumber: log.blockNumber.toString(),
        explorerUrl: `${monadTestnet.blockExplorers.default.url}/tx/${log.transactionHash}`,
      } satisfies RegistryReceipt;
    }),
  );

  return receipts.sort((left, right) => right.issuedAt - left.issuedAt);
}

function transactionError(caught: unknown) {
  const error = caught as ProviderError;
  const errorText = `${error.shortMessage || ""} ${error.message || ""}`;
  const normalizedErrorText = errorText.toLowerCase();
  const errorCode = error.code ?? error.cause?.code;
  if (
    errorCode === 4001 ||
    normalizedErrorText.includes("user rejected") ||
    normalizedErrorText.includes("rejected the request") ||
    normalizedErrorText.includes("user denied")
  ) {
    return new WalletActionCancelledError();
  }
  if (errorText.includes("NullifierAlreadyUsed")) {
    return new Error(
      "This invoice proof is already registered on Monad, so it cannot be financed twice.",
    );
  }
  if (errorText.includes("PolicyMismatch")) {
    return new Error(
      "The proof policy does not match the limits configured in CovenRegistry.",
    );
  }
  if (errorText.includes("InvalidProof")) {
    return new Error("CovenRegistry rejected the Noir proof.");
  }
  return new Error(
    "The Monad registry transaction could not be completed. Check your wallet activity and try again.",
  );
}

export async function registerCvaOnMonad({
  account,
  assetAddress,
  proof,
  onStatus,
}: {
  account: Address;
  assetAddress: Address;
  proof: BrowserProof;
  onStatus?: (message: string) => void;
}): Promise<RegistryReceipt> {
  try {
    await switchToMonadTestnet();
    const registryAddress = configuredRegistryAddress();
    const provider = await activeWalletProvider();
    const publicClient = registryPublicClient();
    const walletClient = createWalletClient({
      account,
      chain: monadTestnet,
      transport: custom(provider),
    });

    onStatus?.("Checking the registry transaction");
    const { request } = await publicClient.simulateContract({
      account,
      address: registryAddress,
      abi: registryAbi,
      functionName: "issue",
      args: [proof.proof, [...proof.publicInputs], assetAddress],
    });

    onStatus?.("Approve the Monad registration in your wallet");
    const transactionHash = await walletClient.writeContract(request);

    onStatus?.("Waiting for Monad confirmation");
    const transactionReceipt = await publicClient.waitForTransactionReceipt({
      hash: transactionHash,
      confirmations: 1,
      timeout: 120_000,
    });
    if (transactionReceipt.status !== "success") {
      throw new Error("Monad rejected the registry transaction.");
    }

    onStatus?.("Reading the confirmed registry record");
    const record = await publicClient.readContract({
      address: registryAddress,
      abi: registryAbi,
      functionName: "issuances",
      args: [proof.nullifier],
    });
    const [commitment, issuer, registeredAsset, issuedAt] = record;

    if (
      commitment.toLowerCase() !== proof.commitment.toLowerCase() ||
      issuer.toLowerCase() !== account.toLowerCase() ||
      registeredAsset.toLowerCase() !== assetAddress.toLowerCase()
    ) {
      throw new Error(
        "Monad confirmed the transaction, but the registry read-back did not match this issuance.",
      );
    }

    return {
      transactionHash,
      registryAddress,
      assetAddress: registeredAsset,
      commitment,
      nullifier: proof.nullifier,
      issuer,
      issuedAt: Number(issuedAt),
      blockNumber: transactionReceipt.blockNumber.toString(),
      explorerUrl: `${monadTestnet.blockExplorers.default.url}/tx/${transactionHash}`,
    };
  } catch (caught) {
    throw transactionError(caught);
  }
}
