/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CVD_API_URL?: string;
  readonly VITE_CVD_API_READ_MODE?: 'supabase' | 'compare' | 'worker';
  readonly VITE_CVD_API_WRITES_ENABLED?: 'true' | 'false';
  readonly VITE_CVD_APP_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
