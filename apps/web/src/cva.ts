import {
  createPublicClient,
  createWalletClient,
  custom,
  formatUnits,
  http,
  keccak256,
  parseUnits,
  stringToHex,
  type Address,
  type Hex,
} from "viem";
import { activeWalletProvider, monadTestnet, switchToMonadTestnet } from "./wallet";

const defaultAdminRole = `0x${"0".repeat(64)}` as Hex;
const minterRole = keccak256(stringToHex("MINTER_ROLE"));

const cvaAbi = [
  {
    type: "function",
    name: "name",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "hasRole",
    stateMutability: "view",
    inputs: [
      { name: "role", type: "bytes32" },
      { name: "account", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "grantRole",
    stateMutability: "nonpayable",
    inputs: [
      { name: "role", type: "bytes32" },
      { name: "account", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
] as const;

export type CvaSnapshot = {
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
  walletBalance: string;
  recipientBalance?: string;
  hasAdminRole: boolean;
  hasMinterRole: boolean;
};

export type CvaActionReceipt = {
  transactionHash: Hex;
  explorerUrl: string;
  blockNumber: string;
};

export type InvestorHolding = {
  name: string;
  symbol: string;
  decimals: number;
  balance: string;
  totalSupply: string;
  latestTransfer?: {
    transactionHash: Hex;
    blockNumber: string;
    from: Address;
    amount: string;
    explorerUrl: string;
  };
};

type ProviderError = Error & {
  code?: number;
  shortMessage?: string;
  cause?: ProviderError;
};

function publicClient() {
  return createPublicClient({
    chain: monadTestnet,
    transport: http(monadTestnet.rpcUrls.default.http[0]),
  });
}

function actionError(caught: unknown) {
  const error = caught as ProviderError;
  let cursor: ProviderError | undefined = error;
  let code: number | undefined;
  while (cursor) {
    code ??= cursor.code;
    cursor = cursor.cause;
  }
  const text = `${error.shortMessage || ""} ${error.message || ""}`.toLowerCase();
  if (
    code === 4001 ||
    text.includes("user rejected") ||
    text.includes("rejected the request") ||
    text.includes("user denied")
  ) {
    const cancellation = new Error("Wallet action cancelled.");
    cancellation.name = "WalletActionCancelledError";
    return cancellation;
  }
  if (text.includes("transfernotallowed")) {
    return new Error(
      "The Cleanverse RuleV2 policy blocked this transfer. Recheck the investor's CVI eligibility.",
    );
  }
  if (text.includes("accesscontrol") || text.includes("unauthorizedaccount")) {
    return new Error("This wallet does not hold the required CVA administrator role.");
  }
  if (text.includes("exceeds balance") || text.includes("insufficient balance")) {
    return new Error("The issuer does not hold enough CVA participation units.");
  }
  return new Error("The CVA transaction could not be completed. Check your wallet and try again.");
}

export async function readCvaSnapshot(
  asset: Address,
  wallet: Address,
  recipient?: Address,
): Promise<CvaSnapshot> {
  const client = publicClient();
  const [name, symbol, decimals, totalSupply, walletBalance, hasAdminRole, hasMinterRole] =
    await Promise.all([
      client.readContract({ address: asset, abi: cvaAbi, functionName: "name" }),
      client.readContract({ address: asset, abi: cvaAbi, functionName: "symbol" }),
      client.readContract({ address: asset, abi: cvaAbi, functionName: "decimals" }),
      client.readContract({ address: asset, abi: cvaAbi, functionName: "totalSupply" }),
      client.readContract({
        address: asset,
        abi: cvaAbi,
        functionName: "balanceOf",
        args: [wallet],
      }),
      client.readContract({
        address: asset,
        abi: cvaAbi,
        functionName: "hasRole",
        args: [defaultAdminRole, wallet],
      }),
      client.readContract({
        address: asset,
        abi: cvaAbi,
        functionName: "hasRole",
        args: [minterRole, wallet],
      }),
    ]);
  const recipientBalance = recipient
    ? await client.readContract({
        address: asset,
        abi: cvaAbi,
        functionName: "balanceOf",
        args: [recipient],
      })
    : undefined;

  return {
    name,
    symbol,
    decimals,
    totalSupply: formatUnits(totalSupply, decimals),
    walletBalance: formatUnits(walletBalance, decimals),
    recipientBalance:
      recipientBalance === undefined
        ? undefined
        : formatUnits(recipientBalance, decimals),
    hasAdminRole,
    hasMinterRole,
  };
}

export async function readInvestorHolding(
  asset: Address,
  investor: Address,
): Promise<InvestorHolding> {
  const client = publicClient();
  const [name, symbol, decimals, balance, totalSupply] = await Promise.all([
    client.readContract({ address: asset, abi: cvaAbi, functionName: "name" }),
    client.readContract({ address: asset, abi: cvaAbi, functionName: "symbol" }),
    client.readContract({ address: asset, abi: cvaAbi, functionName: "decimals" }),
    client.readContract({
      address: asset,
      abi: cvaAbi,
      functionName: "balanceOf",
      args: [investor],
    }),
    client.readContract({ address: asset, abi: cvaAbi, functionName: "totalSupply" }),
  ]);

  return {
    name,
    symbol,
    decimals,
    balance: formatUnits(balance, decimals),
    totalSupply: formatUnits(totalSupply, decimals),
  };
}

async function submitCvaAction({
  asset,
  account,
  functionName,
  args,
  onStatus,
}: {
  asset: Address;
  account: Address;
  functionName: "grantRole" | "mint" | "transfer";
  args: readonly [Hex, Address] | readonly [Address, bigint];
  onStatus?: (message: string) => void;
}): Promise<CvaActionReceipt> {
  try {
    await switchToMonadTestnet();
    const client = publicClient();
    const walletClient = createWalletClient({
      account,
      chain: monadTestnet,
      transport: custom(await activeWalletProvider()),
    });
    onStatus?.("Checking the CVA transaction");
    const { request } = await client.simulateContract({
      account,
      address: asset,
      abi: cvaAbi,
      functionName,
      args: args as never,
    });
    onStatus?.("Approve the CVA transaction in your wallet");
    const transactionHash = await walletClient.writeContract(request);
    onStatus?.("Waiting for Monad confirmation");
    const receipt = await client.waitForTransactionReceipt({
      hash: transactionHash,
      confirmations: 1,
      timeout: 120_000,
    });
    if (receipt.status !== "success") {
      throw new Error("Monad reverted the CVA transaction.");
    }
    return {
      transactionHash,
      explorerUrl: `${monadTestnet.blockExplorers.default.url}/tx/${transactionHash}`,
      blockNumber: receipt.blockNumber.toString(),
    };
  } catch (caught) {
    throw actionError(caught);
  }
}

export function activateCvaMinting(
  asset: Address,
  account: Address,
  onStatus?: (message: string) => void,
) {
  return submitCvaAction({
    asset,
    account,
    functionName: "grantRole",
    args: [minterRole, account],
    onStatus,
  });
}

export function mintCvaUnits(
  asset: Address,
  account: Address,
  amount: string,
  decimals: number,
  onStatus?: (message: string) => void,
) {
  return submitCvaAction({
    asset,
    account,
    functionName: "mint",
    args: [account, parseUnits(amount, decimals)],
    onStatus,
  });
}

export function transferCvaUnits(
  asset: Address,
  account: Address,
  recipient: Address,
  amount: string,
  decimals: number,
  onStatus?: (message: string) => void,
) {
  return submitCvaAction({
    asset,
    account,
    functionName: "transfer",
    args: [recipient, parseUnits(amount, decimals)],
    onStatus,
  });
}
