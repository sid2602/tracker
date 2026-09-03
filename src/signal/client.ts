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

  const connect = () => {
    if (options.signal?.aborted) return;

    logger.info({ host: config.signalRpcHost, port: config.signalRpcPort }, "Connecting to signal-cli JSON-RPC...");
    
    socket = net.createConnection({
      host: config.signalRpcHost,
      port: config.signalRpcPort,
    });

    socket.on("connect", () => {
      logger.info("Connected to signal-cli JSON-RPC");
    });

    const rl = readline.createInterface({
      input: socket,
      crlfDelay: Infinity,
    });

    rl.on("error", (err) => {
       logger.warn({ err }, "Readline error");
    });

    rl.on("line", (line) => {
      if (!line.trim()) return;
      try {
        const payload = JSON.parse(line);
        if (payload.method === "receive") {
          onPayload(payload).catch((err) => {
            logger.error({ err }, "Failed to process payload in onPayload");
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
      logger.warn("signal-cli JSON-RPC socket closed, reconnecting in 5s...");
      reconnectTimeout = setTimeout(connect, 5000);
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
    const payload = {
      jsonrpc: "2.0",
      method: "send",
      params: {
        message,
        recipient: [recipient],
        notifySelf: true,
      },
      id,
    };

    socket.on("connect", () => {
      socket.write(JSON.stringify(payload) + "\n");
    });

    const rl = readline.createInterface({
      input: socket,
      crlfDelay: Infinity,
    });

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
          socket.destroy();
        }
      } catch (err) {}
    });

    socket.on("error", (error) => {
      reject(error);
    });
    
    setTimeout(() => {
      socket.destroy();
      reject(new Error("Send command timed out"));
    }, 10000);
  });
}
