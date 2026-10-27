/** 建置時由 vite.config.ts 注入 */
declare const __APP_VERSION__: string;
declare const __BUILD_DATE__: string;

export const APP_VERSION = __APP_VERSION__;
export const BUILD_DATE = __BUILD_DATE__;
