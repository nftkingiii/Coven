/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_PROVER_URL?: string;
  readonly VITE_MONAD_RPC_URL?: string;
  readonly VITE_MONAD_HISTORY_RPC_URL?: string;
  readonly VITE_MONAD_EXPLORER_URL?: string;
  readonly VITE_COVEN_REGISTRY_ADDRESS?: string;
  readonly VITE_COVEN_REGISTRY_DEPLOYMENT_BLOCK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
