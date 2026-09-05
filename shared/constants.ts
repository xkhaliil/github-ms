/** Ports are fixed so the app always lives at a predictable local address. */
export const WEB_PORT = 5123;
export const API_PORT = 5124;

/** The app is single-user and local-only. Binding to loopback is a hard requirement. */
export const HOST = "127.0.0.1";

export const APP_URL = `http://${HOST}:${WEB_PORT}`;
export const API_URL = `http://${HOST}:${API_PORT}`;

/** Header carrying the per-process session token issued at startup. */
export const SESSION_HEADER = "x-gitms-session";
