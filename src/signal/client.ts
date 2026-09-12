import { randomUUID } from "node:crypto";
import * as net from "node:net";
import * as readline from "node:readline";
import type { Config } from "../config.js";
import { logger } from "../lib/logger.js";
import {
  BoundedReceiveQueue,
  JsonLineFramer,
  MAX_RECEIVE_QUEUE_PAYLOADS,
  RECEIVE_SOCKET_HIGH_WATER_MARK,
  ReceiveProtocolError,
} from "./receive-queue.js";

export async function listenForMessages(
  config: Config,
  onPayload: (payload: unknown) => Promise<void>,
  options: { signal?: AbortSignal } = {},
): Promise<void> {
  let reconnectTimeout: NodeJS.Timeout | null = null;
  let activeConnection: ReceiveConnection | null = null;
  let generation = 0;
  let attempts = 0;
  let stopping = false;
  let stopped = false;
  let resolveStopped: (() => void) | undefined;
  let connect: () => void;
  let flushConnectionFramer: (
    connection: ReceiveConnection,
  ) => Promise<void>;

  const stoppedPromise = new Promise<void>((resolve) => {
    resolveStopped = resolve;
  });
  const isCurrentConnection = (connection: ReceiveConnection): boolean =>
    activeConnection === connection &&
    connection.generation === generation;

  const dispatcher = new BoundedReceiveQueue<unknown>(
    (payload) => persistPayloadWithRetry(payload, onPayload),
    MAX_RECEIVE_QUEUE_PAYLOADS,
    () => {
      const connection = activeConnection;
      if (connection) {
        void flushConnectionFramer(connection);
      }
    },
  );

  const finishStopping = async (): Promise<void> => {
    if (stopped) {
      return;
    }

    dispatcher.stopAccepting();
    await dispatcher.drain();
    if (!stopped) {
      stopped = true;
      resolveStopped?.();
    }
  };

  const scheduleReconnect = (): void => {
    if (stopping || reconnectTimeout !== null) {
      return;
    }

    attempts++;
    const delayMs = Math.min(5000 * Math.pow(2, attempts - 1), 60000);
    logger.warn(
      { delayMs, attempts },
      "signal-cli JSON-RPC socket closed, reconnecting",
    );
    reconnectTimeout = setTimeout(() => {
      reconnectTimeout = null;
      connect();
    }, delayMs);
  };

  const handleLine = (
    connection: ReceiveConnection,
    line: string,
  ): boolean => {
    if (!line.trim()) {
      return true;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(line);
    } catch (error: unknown) {
      logger.error(
        { error, lineBytes: Buffer.byteLength(line, "utf8") },
        "Malformed Signal JSON-RPC frame",
      );
      throw new ReceiveProtocolError("Malformed Signal JSON-RPC frame");
    }

    if (!isReceivePayload(payload)) {
      return true;
    }

    if (!dispatcher.enqueue(payload)) {
      connection.socket.pause();
      return false;
    }

    if (!dispatcher.hasCapacity) {
      connection.socket.pause();
    }
    return true;
  };

  const handleSocketChunk = (
    connection: ReceiveConnection,
    chunk: Buffer,
  ): boolean => {
    if (
      !isCurrentConnection(connection) ||
      connection.closeHandled ||
      stopping
    ) {
      return false;
    }

    try {
      connection.framer.push(chunk, (line) =>
        handleLine(connection, line),
      );
      if (!dispatcher.hasCapacity) {
        connection.socket.pause();
        return false;
      }
      return true;
    } catch (error: unknown) {
      if (error instanceof ReceiveProtocolError) {
        logger.error({ error }, "Signal receive protocol frame rejected");
      } else {
        logger.error({ error }, "Failed to frame Signal JSON-RPC data");
      }
      connection.socket.destroy();
      return false;
    }
  };

  flushConnectionFramer = async (
    connection: ReceiveConnection,
  ): Promise<void> => {
    if (connection.drainPromise !== null) {
      return connection.drainPromise;
    }

    const drainPromise = connection.framer
      .flush(
        (line) => handleLine(connection, line),
        () => dispatcher.waitForCapacity(),
      )
      .catch((error: unknown) => {
        logger.error({ error }, "Failed to drain Signal receive frame");
        connection.socket.destroy();
      })
      .finally(() => {
        connection.drainPromise = null;
        if (
          isCurrentConnection(connection) &&
          !connection.closeHandled &&
          !stopping &&
          dispatcher.hasCapacity
        ) {
          connection.socket.resume();
        }
      });

    connection.drainPromise = drainPromise;
    return drainPromise;
  };

  const handleConnectionClose = async (
    connection: ReceiveConnection,
  ): Promise<void> => {
    if (connection.closeHandled) {
      return;
    }

    connection.closeHandled = true;
    await flushConnectionFramer(connection);
    connection.framer.close();

    if (!isCurrentConnection(connection)) {
      return;
    }

    activeConnection = null;
    if (stopping) {
      await finishStopping();
      return;
    }

    scheduleReconnect();
  };

  connect = (): void => {
    if (stopping) {
      return;
    }

    generation++;
    let connection: ReceiveConnection | undefined;
    const socket = new net.Socket({
      onread: {
        buffer: () => Buffer.alloc(RECEIVE_SOCKET_HIGH_WATER_MARK),
        callback: (bytesWritten, buffer) => {
          const currentConnection = connection;
          if (!currentConnection) {
            return false;
          }

          return handleSocketChunk(
            currentConnection,
            Buffer.from(buffer.subarray(0, bytesWritten)),
          );
        },
      },
    });
    connection = {
      generation,
      socket,
      framer: new JsonLineFramer(),
      closeHandled: false,
      drainPromise: null,
    };
    activeConnection = connection;

    logger.info(
      { host: config.signalRpcHost, port: config.signalRpcPort },
      "Connecting to signal-cli JSON-RPC...",
    );

    connection.socket.on("connect", () => {
      if (!isCurrentConnection(connection)) {
        return;
      }

      attempts = 0;
      logger.info("Connected to signal-cli JSON-RPC");
    });

    connection.socket.on("error", (error) => {
      logger.error({ error }, "signal-cli JSON-RPC socket error");
    });

    connection.socket.on("close", () => {
      void handleConnectionClose(connection);
    });

    connection.socket.connect({
      host: config.signalRpcHost,
      port: config.signalRpcPort,
    });
  };

  const stop = (): void => {
    if (stopping) {
      return;
    }

    stopping = true;
    if (reconnectTimeout !== null) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }

    const connection = activeConnection;
    if (connection) {
      connection.socket.destroy();
    } else {
      void finishStopping();
    }
  };

  if (options.signal?.aborted) {
    stop();
  } else {
    options.signal?.addEventListener("abort", stop, { once: true });
    connect();
  }

  await stoppedPromise;
}

export async function persistPayloadWithRetry(
  payload: unknown,
  onPayload: (payload: unknown) => Promise<void>,
  options: {
    wait?: (delayMs: number) => Promise<void>;
  } = {},
): Promise<void> {
  let delayMs = 1_000;
  const wait =
    options.wait ??
    ((delay: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, delay)));

  while (true) {
    try {
      await onPayload(payload);
      return;
    } catch (error: unknown) {
      logger.error(
        { error, delayMs },
        "Failed to persist Signal payload, retrying",
      );
      await wait(delayMs);
      delayMs = Math.min(delayMs * 2, 60_000);
    }
  }
}

type ReceiveConnection = {
  generation: number;
  socket: net.Socket;
  framer: JsonLineFramer;
  closeHandled: boolean;
  drainPromise: Promise<void> | null;
};

function isReceivePayload(value: unknown): boolean {
  return isRecord(value) && value.method === "receive";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
        const response: unknown = JSON.parse(line);
        if (!isRecord(response) || response.id !== id) {
          return;
        }

        if (response.error) {
          reject(new Error(`Signal send failed: ${JSON.stringify(response.error)}`));
        } else {
          resolve();
        }
        cleanup();
      } catch (error: unknown) {
        logger.warn({ error }, "Failed to parse Signal send response");
      }
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
