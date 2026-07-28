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
      name: "MonadVision",
      url:
        import.meta.env.VITE_MONAD_EXPLORER_URL ||
        "https://testnet.monadvision.com",
    },
  },
  testnet: true,
});

type InjectedProvider = EIP1193Provider & {
  isMetaMask?: boolean;
  providers?: InjectedProvider[];
};

type ProviderError = Error & { code?: number };

declare global {
  interface Window {
    ethereum?: InjectedProvider;
  }
}

function injectedProvider(): InjectedProvider {
  if (!window.ethereum) {
    throw new Error(
      "No browser wallet detected. Open Coven in the browser where MetaMask is installed, then refresh.",
    );
  }

  const providers = window.ethereum.providers;
  return providers?.find((provider) => provider.isMetaMask) || window.ethereum;
}

export async function connectBrowserWallet(): Promise<Address> {
  const provider = injectedProvider();
  let accounts: unknown;

  try {
    accounts = await provider.request({ method: "eth_requestAccounts" });
  } catch (caught) {
    const error = caught as ProviderError;
    if (error.code === 4001) {
      throw new Error("Wallet connection was rejected. Approve the request in MetaMask to continue.");
    }
    throw new Error(error.message || "The wallet could not be connected.");
  }

  const account = Array.isArray(accounts) ? accounts[0] : undefined;
  if (typeof account !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(account)) {
    throw new Error("MetaMask did not return a valid account.");
  }

  return account as Address;
}

export async function switchToMonadTestnet(): Promise<void> {
  const provider = injectedProvider();
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
