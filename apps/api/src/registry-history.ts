import {
  createPublicClient,
  defineChain,
  fallback,
  getAddress,
  http,
  type Address,
  type Hex,
} from "viem";

const registryAbi = [
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

const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.MONAD_RPC_URL || "https://testnet-rpc.monad.xyz"],
    },
  },
  blockExplorers: {
    default: {
      name: "MonadVision",
      url:
        process.env.MONAD_EXPLORER_URL ||
        "https://testnet.monadvision.com",
    },
  },
  testnet: true,
});

const registryAddress = getAddress(
  process.env.COVEN_REGISTRY_ADDRESS ||
    "0xb5bdc630f78BEB587235C42e4fD4b6c67Fd1d65a",
);
const deploymentBlock = BigInt(
  process.env.COVEN_REGISTRY_DEPLOYMENT_BLOCK || "51305108",
);
const officialRpcUrl = "https://testnet-rpc.monad.xyz";
const secondaryRpcUrl = "https://monad-testnet.drpc.org";
const logBlockWindow = 100n;
const logScanConcurrency = 2;
const rpcTimeoutMs = 8_000;

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

export type RegistryHistoryRecord = {
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

export type RegistryHistoryResult = {
  records: RegistryHistoryRecord[];
  stale: boolean;
  syncedToBlock?: string;
  warning?: string;
};

// On-chain-confirmed Coven issuances retained as durable index checkpoints.
// Public RPCs cap log ranges, so a cold scan begins near the newest checkpoint.
// These records preserve confirmed receipts that predate that scan window.
const registryCheckpoints: RegistryHistoryRecord[] = [
  {
    transactionHash:
      "0xd18129eda099b71db87e84bf8c72f0c8724f945ba49467824c9e0a16acc7c586",
    registryAddress,
    assetAddress: getAddress("0xdFf72480344D28cA7d9242ce80B9c61fD8Af8b7E"),
    commitment:
      "0x1fa06287aa4fc55bf773ba6bcd606e73cba5ea68bae64509cfb67409a41f88d4",
    nullifier:
      "0x037d2f17bec3988916e445d2d5f78596613ed5d47c4af6ba0cd27aa233a1be01",
    issuer: getAddress("0xC6CFa54eDA215a62fD5495A9B6555Bd85b6B7ddB"),
    issuedAt: 1785999530,
    blockNumber: "51319585",
    explorerUrl:
      "https://testnet.monadvision.com/tx/0xd18129eda099b71db87e84bf8c72f0c8724f945ba49467824c9e0a16acc7c586",
  },
  {
  transactionHash:
    "0x9d752efd02a7079f6416ec16b8e9f54877fc3224b1401b152c497353797d8f77",
  registryAddress,
  assetAddress: getAddress("0xE821F58B1F393A46cc3Cd9ba420A19c2ef62a2ec"),
  commitment:
    "0x1f84692c295268f9688bc8899014241c32f7e49b17155ca64f133e55e1bc87f4",
  nullifier:
    "0x112f0b24e22228c8da8d36d6865f31326c520c3a6a3e0e288b543b7173aa2b7d",
  issuer: getAddress("0x8aAB2E27bd9Ce18Ca44722CCE48ADCc10df0C4c4"),
  issuedAt: 1786013493,
  blockNumber: "51365838",
  explorerUrl:
    "https://testnet.monadvision.com/tx/0x9d752efd02a7079f6416ec16b8e9f54877fc3224b1401b152c497353797d8f77",
  },
];

const historyCache = new Map<
  string,
  { scannedToBlock: bigint; records: RegistryHistoryRecord[] }
>();

export function uniqueHttpsRpcUrls(values: Array<string | undefined>) {
  const urls: string[] = [];
  for (const value of values) {
    if (!value) continue;
    try {
      const url = new URL(value);
      if (url.protocol !== "https:") continue;
      const normalized = url.toString();
      if (!urls.includes(normalized)) urls.push(normalized);
    } catch {
      // Invalid operator configuration is ignored in favor of known-safe RPCs.
    }
  }
  return urls;
}

const readRpcUrls = uniqueHttpsRpcUrls([
  process.env.MONAD_RPC_URL,
  officialRpcUrl,
  secondaryRpcUrl,
]);
const historyRpcUrls = uniqueHttpsRpcUrls([
  process.env.MONAD_HISTORY_RPC_URL,
  process.env.MONAD_RPC_URL,
  officialRpcUrl,
  secondaryRpcUrl,
]);

function resilientClient(urls: string[]) {
  return createPublicClient({
    chain: monadTestnet,
    transport: fallback(
      urls.map((url) => http(url, { retryCount: 0, timeout: rpcTimeoutMs })),
      { retryCount: 0 },
    ),
  });
}

export function mergeRegistryRecords(...recordSets: RegistryHistoryRecord[][]) {
  return recordSets
    .flat()
    .filter(
      (record, index, records) =>
        records.findIndex(
          (candidate) => candidate.transactionHash === record.transactionHash,
        ) === index,
    )
    .sort((left, right) => right.issuedAt - left.issuedAt);
}

export function registryHistorySnapshot(
  account?: Address,
): RegistryHistoryResult {
  const cacheKey = account?.toLowerCase() || "all";
  const cached = historyCache.get(cacheKey);
  const checkpointRecords = registryCheckpoints.filter(
    (record) => !account || record.issuer.toLowerCase() === account.toLowerCase(),
  );
  return {
    records: mergeRegistryRecords(cached?.records || [], checkpointRecords),
    stale: false,
    ...(cached
      ? { syncedToBlock: cached.scannedToBlock.toString() }
      : checkpointRecords.length > 0
        ? {
            syncedToBlock: checkpointRecords
              .reduce((latest, record) =>
                BigInt(record.blockNumber) > BigInt(latest.blockNumber)
                  ? record
                  : latest,
              )
              .blockNumber,
          }
        : {}),
  };
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function loadRegistryHistory(
  account?: Address,
): Promise<RegistryHistoryResult> {
  const readClient = resilientClient(readRpcUrls);
  const historyClient = resilientClient(historyRpcUrls);
  const cacheKey = account?.toLowerCase() || "all";
  const cached = historyCache.get(cacheKey);
  const durableRecords = registryHistorySnapshot(account).records;

  try {
    const latestBlock = await readClient.getBlockNumber();
    const checkpointBlock = registryCheckpoints.reduce(
      (latest, record) =>
        BigInt(record.blockNumber) > latest ? BigInt(record.blockNumber) : latest,
      deploymentBlock,
    );
    const firstUnindexedBlock =
      checkpointBlock >= deploymentBlock
        ? checkpointBlock + 1n
        : deploymentBlock;
    const recentWindowStart =
      latestBlock >= logBlockWindow ? latestBlock - logBlockWindow + 1n : 0n;
    // Keep cold starts fast and inside public-RPC limits. Once warm, the cache
    // advances continuously from its previous high-water mark.
    const initialScanStart =
      recentWindowStart > firstUnindexedBlock
        ? recentWindowStart
        : firstUnindexedBlock;
    const scanStart = cached ? cached.scannedToBlock + 1n : initialScanStart;
    const logs: RegistryIssuanceEvent[] = [];

    const ranges: Array<{ fromBlock: bigint; toBlock: bigint }> = [];
    for (
      let fromBlock = scanStart;
      fromBlock <= latestBlock;
      fromBlock += logBlockWindow
    ) {
      const candidateEnd = fromBlock + logBlockWindow - 1n;
      ranges.push({
        fromBlock,
        toBlock: candidateEnd < latestBlock ? candidateEnd : latestBlock,
      });
    }
    let nextRange = 0;
    await Promise.all(
      Array.from(
        { length: Math.min(logScanConcurrency, ranges.length) },
        async () => {
          while (nextRange < ranges.length) {
            const range = ranges[nextRange];
            nextRange += 1;
            let chunk: RegistryIssuanceEvent[] | undefined;
            let lastError: unknown;
            for (let attempt = 0; attempt < 3; attempt += 1) {
              try {
                chunk = (await historyClient.getContractEvents({
                  address: registryAddress,
                  abi: registryAbi,
                  eventName: "InvoiceIssued",
                  ...(account ? { args: { issuer: account } } : {}),
                  ...range,
                  strict: true,
                })) as RegistryIssuanceEvent[];
                break;
              } catch (error) {
                lastError = error;
                if (attempt < 2) await wait(300 * (attempt + 1));
              }
            }
            if (!chunk) throw lastError;
            logs.push(...chunk);
          }
        },
      ),
    );

    const newRecords = await Promise.all(
      logs.map(async (log) => {
        const block = await readClient.getBlock({
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
        };
      }),
    );

    const records = mergeRegistryRecords(newRecords, durableRecords);
    historyCache.set(cacheKey, { scannedToBlock: latestBlock, records });
    return {
      records,
      stale: false,
      syncedToBlock: latestBlock.toString(),
    };
  } catch {
    return {
      records: durableRecords,
      stale: true,
      ...(cached ? { syncedToBlock: cached.scannedToBlock.toString() } : {}),
      warning:
        "Live Monad history is temporarily delayed; showing the last confirmed registry records.",
    };
  }
}
