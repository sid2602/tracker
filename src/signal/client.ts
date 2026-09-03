import type { Config } from "../config.js";

const RECONNECT_DELAY_MS = 2_000;

export function buildReceiveWebSocketUrl(config: Config): string {
  const apiUrl = new URL(config.signalApiUrl);
  apiUrl.protocol = apiUrl.protocol === "https:" ? "wss:" : "ws:";
  apiUrl.pathname = `/v1/receive/${encodeURIComponent(config.signalPhoneNumber)}`;
  apiUrl.search = "";

  return apiUrl.toString();
}

export function parseWebSocketPayload(data: unknown): unknown | null {
  if (typeof data === "string") {
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  if (data instanceof ArrayBuffer) {
    return parseWebSocketPayload(new TextDecoder().decode(data));
  }

  if (ArrayBuffer.isView(data)) {
    return parseWebSocketPayload(new TextDecoder().decode(data));
  }

  return null;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }

    const timeout = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timeout);
      resolve();
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function readSocket(
  config: Config,
  onPayload: (payload: unknown) => Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  const url = buildReceiveWebSocketUrl(config);
  console.log(`[${new Date().toISOString()}] signal connecting ${url}`);
  const socket = new WebSocket(url);

  await new Promise<void>((resolve) => {
    const onAbort = () => {
      socket.close();
    };

    signal?.addEventListener("abort", onAbort, { once: true });

    socket.addEventListener("open", () => {
      console.log(`[${new Date().toISOString()}] signal connected`);
    });

    socket.addEventListener("message", (event) => {
      const parsed = parseWebSocketPayload(event.data);
      if (parsed === null) {
        console.warn(
          `[${new Date().toISOString()}] signal received non-JSON payload`,
        );
        return;
      }

      const items = Array.isArray(parsed) ? parsed : [parsed];

      void (async () => {
        for (const item of items) {
          try {
            await onPayload(item);
          } catch (error) {
            console.warn(
              `[${new Date().toISOString()}] Failed to handle Signal payload`,
              error,
            );
          }
        }
      })();
    });

    socket.addEventListener("error", () => {
      console.warn(`[${new Date().toISOString()}] signal websocket error`);
    });

    socket.addEventListener("close", () => {
      signal?.removeEventListener("abort", onAbort);
      console.log(`[${new Date().toISOString()}] signal disconnected`);
      resolve();
    });

    if (signal?.aborted) {
      socket.close();
    }
  });
}

export async function listenForMessages(
  config: Config,
  onPayload: (payload: unknown) => Promise<void>,
  options: { signal?: AbortSignal; reconnectDelayMs?: number } = {},
): Promise<void> {
  const reconnectDelayMs = options.reconnectDelayMs ?? RECONNECT_DELAY_MS;

  while (!options.signal?.aborted) {
    try {
      await readSocket(config, onPayload, options.signal);
    } catch (error) {
      if (options.signal?.aborted) {
        return;
      }

      console.warn(
        `[${new Date().toISOString()}] Signal WebSocket error`,
        error,
      );
    }

    if (options.signal?.aborted) {
      return;
    }

    console.log(
      `[${new Date().toISOString()}] signal reconnecting in ${reconnectDelayMs}ms`,
    );
    await delay(reconnectDelayMs, options.signal);
  }
}

export async function sendMessage(
  config: Config,
  recipient: string,
  message: string,
): Promise<void> {
  const url = new URL("/v2/send", config.signalApiUrl);
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      number: config.signalPhoneNumber,
      recipients: [recipient],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Signal send failed: ${response.status} ${body}`);
  }
}
