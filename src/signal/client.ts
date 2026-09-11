import * as net from "node:net";
import * as readline from "node:readline";
import { randomUUID } from "node:crypto";
import type { Config } from "../config.js";
import { logger } from "../lib/logger.js";

export async function listenForMessages(
  config: Config,
  onPayload: (payload: unknown) => Promise<void>,
  options: { signal?: AbortSignal } = {},
): Promise<void> {
  let reconnectTimeout: NodeJS.Timeout | null = null;
  let socket: net.Socket | null = null;
  let attempts = 0;

  const connect = () => {
    if (options.signal?.aborted) return;

    logger.info({ host: config.signalRpcHost, port: config.signalRpcPort }, "Connecting to signal-cli JSON-RPC...");
    
    socket = net.createConnection({
      host: config.signalRpcHost,
      port: config.signalRpcPort,
    });

    socket.on("connect", () => {
      attempts = 0;
      logger.info("Connected to signal-cli JSON-RPC");
    });

    const rl = readline.createInterface({
      input: socket,
      crlfDelay: Infinity,
    });
    let payloadQueue = Promise.resolve();

    rl.on("error", (err) => {
       logger.warn({ err }, "Readline error");
    });

    rl.on("line", (line) => {
      if (!line.trim()) return;
      try {
        const payload = JSON.parse(line);
        if (payload.method === "receive") {
          payloadQueue = payloadQueue
            .then(() => persistPayloadWithRetry(payload, onPayload, options.signal))
            .catch((err: unknown) => {
              logger.error({ err }, "Failed to persist Signal payload");
              socket?.destroy();
            });
        }
      } catch (err) {
        logger.error({ err, line }, "Failed to parse JSON-RPC line");
      }
    });

    socket.on("error", (error) => {
      logger.error({ error }, "signal-cli JSON-RPC socket error");
    });

    socket.on("close", () => {
      if (options.signal?.aborted) return;
      attempts++;
      const delayMs = Math.min(5000 * Math.pow(2, attempts - 1), 60000);
      logger.warn(`signal-cli JSON-RPC socket closed, reconnecting in ${delayMs}ms (attempt ${attempts})...`);
      reconnectTimeout = setTimeout(connect, delayMs);
    });
  };

  connect();

  if (options.signal) {
    options.signal.addEventListener("abort", () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (socket) socket.destroy();
    });
  }

  return new Promise((resolve) => {
    if (options.signal) {
      if (options.signal.aborted) return resolve();
      options.signal.addEventListener("abort", () => resolve());
    }
  });
}

async function persistPayloadWithRetry(
  payload: unknown,
  onPayload: (payload: unknown) => Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  let delayMs = 1_000;

  while (!signal?.aborted) {
    try {
      await onPayload(payload);
      return;
    } catch (error: unknown) {
      logger.error({ error, delayMs }, "Failed to persist Signal payload, retrying");
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      delayMs = Math.min(delayMs * 2, 60_000);
    }
  }
}

export async function sendMessage(
  config: Config,
  recipient: string,
  message: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({
      host: config.signalRpcHost,
      port: config.signalRpcPort,
    });

    const id = randomUUID();
    const payload = buildSendPayload(id, recipient, message);

    socket.on("connect", () => {
      socket.write(JSON.stringify(payload) + "\n");
    });

    const rl = readline.createInterface({
      input: socket,
      crlfDelay: Infinity,
    });

    let timeoutId: NodeJS.Timeout;
    
    const cleanup = () => {
      clearTimeout(timeoutId);
      socket.destroy();
    };

    rl.on("line", (line) => {
      if (!line.trim()) return;
      try {
        const response = JSON.parse(line);
        if (response.id === id) {
          if (response.error) {
            reject(new Error(`Signal send failed: ${JSON.stringify(response.error)}`));
          } else {
            resolve();
          }
          cleanup();
        }
      } catch (err) {}
    });

    socket.on("error", (error) => {
      cleanup();
      reject(error);
    });
    
    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error("Send command timed out"));
    }, 10000);
  });
}

export function buildSendPayload(
  id: string,
  recipient: string,
  message: string,
): {
  jsonrpc: "2.0";
  method: "send";
  params: {
    message: string;
    recipient: string[];
    notifySelf: true;
  };
  id: string;
} {
  return {
    jsonrpc: "2.0",
    method: "send",
    params: {
      message,
      recipient: [recipient],
      notifySelf: true,
    },
    id,
  };
}
