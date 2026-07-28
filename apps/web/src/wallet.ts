import {
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
type Eip6963ProviderDetail = {
  info: {
    name: string;
    rdns: string;
    uuid: string;
  };
  provider: InjectedProvider;
};

declare global {
  interface Window {
    ethereum?: InjectedProvider;
  }
}

let activeProvider: InjectedProvider | undefined;

function legacyProvider() {
  const injected = window.ethereum;
  if (!injected) return undefined;
  return injected.providers?.find((provider) => provider.isMetaMask) || injected;
}

async function injectedProvider(): Promise<InjectedProvider> {
  if (activeProvider) return activeProvider;

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

  const metamask = announced.find(
    ({ info, provider }) =>
      provider.isMetaMask || info.rdns.toLowerCase() === "io.metamask",
  );
  activeProvider = metamask?.provider || legacyProvider() || announced[0]?.provider;

  if (!activeProvider) {
    throw new Error(
      "No browser wallet detected. Open Coven in Chrome where MetaMask is installed and enabled, then refresh.",
    );
  }

  return activeProvider;
}

function connectionError(error: ProviderError) {
  if (error.code === 4001) {
    return "Wallet connection was rejected. Approve the request in MetaMask to continue.";
  }
  if (error.code === -32002) {
    return "A wallet request is already waiting. Open MetaMask and approve or cancel the pending request.";
  }
  if (error.code === 4100) {
    return "MetaMask has not authorized Coven. Open MetaMask, connect this site, then try again.";
  }
  return error.message || "The wallet could not be connected.";
}

export async function connectBrowserWallet(): Promise<Address> {
  const provider = await injectedProvider();
  let accounts: unknown;

  try {
    accounts = await provider.request({ method: "eth_requestAccounts" });
  } catch (caught) {
    const error = caught as ProviderError;
    throw new Error(connectionError(error));
  }

  const account = Array.isArray(accounts) ? accounts[0] : undefined;
  if (typeof account !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(account)) {
    throw new Error("MetaMask did not return a valid account.");
  }

  return account as Address;
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
      throw new Error("Monad network switching was rejected in MetaMask.");
    }
    if (error.code !== 4902) {
      throw new Error(error.message || "MetaMask could not switch to Monad Testnet.");
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
        throw new Error("Adding Monad Testnet was rejected in MetaMask.");
      }
      throw new Error(addError.message || "MetaMask could not add Monad Testnet.");
    }
  }
}

export async function connectMonadWallet(): Promise<Address> {
  const account = await connectBrowserWallet();
  await switchToMonadTestnet();
  return account;
}
