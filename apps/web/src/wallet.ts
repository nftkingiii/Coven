import {
  createWalletClient,
  custom,
  defineChain,
  type Address,
  type EIP1193Provider,
} from "viem";

export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: {
    default: {
      http: [
        import.meta.env.VITE_MONAD_RPC_URL ||
          "https://testnet-rpc.monad.xyz",
      ],
    },
  },
  blockExplorers: {
    default: {
      name: "Monadscan",
      url:
        import.meta.env.VITE_MONAD_EXPLORER_URL ||
        "https://testnet.monadscan.com",
    },
  },
  testnet: true,
});

type InjectedProvider = EIP1193Provider & {
  isMetaMask?: boolean;
  providers?: InjectedProvider[];
};

type ProviderError = Error & { code?: number };
class WalletRequestTimeoutError extends Error {}

type Eip6963ProviderDetail = {
  info: {
    name: string;
    rdns: string;
    uuid: string;
  };
  provider: InjectedProvider;
};

type BrowserWallet = {
  id: string;
  name: string;
  rdns: string;
};

type DiscoveredWallet = BrowserWallet & {
  provider: InjectedProvider;
};

declare global {
  interface Window {
    ethereum?: InjectedProvider;
  }
}

let activeProvider: InjectedProvider | undefined;
let discoveredWallets: DiscoveredWallet[] = [];

export function disconnectBrowserWallet() {
  activeProvider = undefined;
  discoveredWallets = [];
}

function legacyProviders() {
  const injected = window.ethereum;
  if (!injected) return [];
  return injected.providers?.length ? injected.providers : [injected];
}

async function discoverWallets(): Promise<DiscoveredWallet[]> {
  const announced: Eip6963ProviderDetail[] = [];
  const onProvider = (event: Event) => {
    const detail = (event as CustomEvent<Eip6963ProviderDetail>).detail;
    if (detail?.provider && !announced.some(({ info }) => info.uuid === detail.info.uuid)) {
      announced.push(detail);
    }
  };

  window.addEventListener("eip6963:announceProvider", onProvider);
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  await new Promise((resolve) => window.setTimeout(resolve, 150));
  window.removeEventListener("eip6963:announceProvider", onProvider);

  const wallets: DiscoveredWallet[] = announced.map(({ info, provider }) => ({
    id: info.uuid,
    name: info.name,
    rdns: info.rdns,
    provider,
  }));

  legacyProviders().forEach((provider, index) => {
    if (wallets.some((wallet) => wallet.provider === provider)) return;
    wallets.push({
      id: `legacy-${index}`,
      name: provider.isMetaMask ? "MetaMask" : `Browser wallet ${index + 1}`,
      rdns: "legacy.injected",
      provider,
    });
  });

  return wallets;
}

async function injectedProvider(): Promise<InjectedProvider> {
  if (!activeProvider) {
    activeProvider = window.ethereum;
  }

  if (!activeProvider) {
    if (!discoveredWallets.length) discoveredWallets = await discoverWallets();
    activeProvider = discoveredWallets[0]?.provider;
  }

  if (!activeProvider) {
    throw new Error(
      "No compatible browser wallet detected. Open Coven where an EVM wallet extension is installed and enabled, then refresh.",
    );
  }

  return activeProvider;
}

export function activeWalletProvider(): Promise<EIP1193Provider> {
  return injectedProvider();
}

async function withWalletTimeout<T>(request: Promise<T>): Promise<T> {
  let timeout: number | undefined;
  try {
    return await Promise.race([
      request,
      new Promise<never>((_resolve, reject) => {
        timeout = window.setTimeout(
          () => reject(new WalletRequestTimeoutError()),
          20_000,
        );
      }),
    ]);
  } finally {
    if (timeout !== undefined) window.clearTimeout(timeout);
  }
}

function connectionError(error: ProviderError) {
  if (error.code === 4001) {
    return "Wallet connection was rejected. Approve the request in your wallet to continue.";
  }
  if (error.code === -32002) {
    return "A wallet request is already waiting. Open your wallet and approve or cancel the pending request.";
  }
  if (error.code === 4100) {
    return "Your wallet has not authorized Coven. Open the wallet, connect this site, then try again.";
  }
  return error.message || "The wallet could not be connected.";
}

export async function connectBrowserWallet(): Promise<Address> {
  const provider = await injectedProvider();
  let accounts: unknown;

  try {
    accounts = await withWalletTimeout(
      provider.request({ method: "eth_requestAccounts" }),
    );
  } catch (caught) {
    if (caught instanceof WalletRequestTimeoutError) {
      activeProvider = undefined;
      throw new Error(
        "The selected wallet did not respond. Open and unlock it, confirm it is enabled for localhost, then try again.",
      );
    }
    const error = caught as ProviderError;
    throw new Error(connectionError(error));
  }

  const account = Array.isArray(accounts) ? accounts[0] : undefined;
  if (typeof account !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(account)) {
    throw new Error("The selected wallet did not return a valid account.");
  }

  return account as Address;
}

export async function signWalletMessage(
  message: string,
  address: Address,
): Promise<`0x${string}`> {
  const provider = await injectedProvider();
  try {
    const signature = await withWalletTimeout(
      createWalletClient({ transport: custom(provider) }).signMessage({
        account: address,
        message,
      }),
    );
    if (typeof signature !== "string" || !/^0x[a-fA-F0-9]+$/.test(signature)) {
      throw new Error("The wallet returned an invalid signature.");
    }
    return signature as `0x${string}`;
  } catch (caught) {
    if (caught instanceof WalletRequestTimeoutError) {
      throw new Error("The wallet did not respond to the signature request.");
    }
    const error = caught as ProviderError;
    throw new Error(connectionError(error));
  }
}

export async function switchToMonadTestnet(): Promise<void> {
  const provider = await injectedProvider();
  const chainId = `0x${monadTestnet.id.toString(16)}`;
  const activeChain = await provider.request({ method: "eth_chainId" });
  if (activeChain === chainId) return;

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId }],
    });
  } catch (caught) {
    const error = caught as ProviderError;
    if (error.code === 4001) {
      throw new Error("Monad network switching was rejected in your wallet.");
    }
    if (error.code !== 4902) {
      throw new Error(error.message || "The wallet could not switch to Monad Testnet.");
    }

    try {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId,
            chainName: monadTestnet.name,
            nativeCurrency: monadTestnet.nativeCurrency,
            rpcUrls: monadTestnet.rpcUrls.default.http,
            blockExplorerUrls: [monadTestnet.blockExplorers.default.url],
          },
        ],
      });
    } catch (addCaught) {
      const addError = addCaught as ProviderError;
      if (addError.code === 4001) {
        throw new Error("Adding Monad Testnet was rejected in your wallet.");
      }
      throw new Error(addError.message || "The wallet could not add Monad Testnet.");
    }
  }
}

export async function connectMonadWallet(): Promise<Address> {
  const account = await connectBrowserWallet();
  await switchToMonadTestnet();
  return account;
}
