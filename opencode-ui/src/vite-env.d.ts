/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OPENCODE_URLS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
