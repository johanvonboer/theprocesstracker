export const IS_TAURI =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export const IS_WEB = !IS_TAURI;
