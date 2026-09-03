import type { Config } from "../config.js";
import { logger } from "../lib/logger.js";

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
  logger.info({ url }, "signal connecting");
  const socket = new WebSocket(url);

  const activeTasks = new Set<Promise<void>>();

  await new Promise<void>((resolve) => {
    let settled = false;

    const settle = () => {
      if (settled) {
        return;
      }
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      resolve();
    };

    const onAbort = () => {
      socket.close();
      settle();
    };

    signal?.addEventListener("abort", onAbort, { once: true });

    socket.addEventListener("open", () => {
      logger.info("signal connected");
    });

    socket.addEventListener("message", (event) => {
      const parsed = parseWebSocketPayload(event.data);
      if (parsed === null) {
        logger.warn("signal received non-JSON payload");
        return;
      }

      const items = Array.isArray(parsed) ? parsed : [parsed];

      const task = (async () => {
        for (const item of items) {
          try {
            await onPayload(item);
          } catch (error) {
            logger.warn({ error }, "Failed to handle Signal payload");
          }
        }
      })();

      activeTasks.add(task);
      task.finally(() => activeTasks.delete(task));
    });

    socket.addEventListener("error", () => {
      logger.warn("signal websocket error");
      try {
        socket.close();
      } catch {
        // ignore close failures after a failed handshake
      }
      settle();
    });

    socket.addEventListener("close", () => {
      logger.info("signal disconnected");
      settle();
    });

    if (signal?.aborted) {
      socket.close();
      settle();
    }
  });

  if (activeTasks.size > 0) {
    logger.info({ tasks: activeTasks.size }, "waiting for active tasks to finish");
    await Promise.allSettled(Array.from(activeTasks));
  }
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

      logger.warn({ error }, "Signal WebSocket error");
    }

    if (options.signal?.aborted) {
      return;
    }

    logger.info({ reconnectDelayMs }, "signal reconnecting");
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
