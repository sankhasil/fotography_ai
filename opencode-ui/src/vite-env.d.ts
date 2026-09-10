/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OPENCODE_URLS?: string;
  readonly VITE_FOLDERS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
