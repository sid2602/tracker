import { describe, expect, it, vi } from "vitest";
import { persistPayloadWithRetry } from "./client.js";
import {
  BoundedReceiveQueue,
  JsonLineFramer,
  ReceiveProtocolError,
} from "./receive-queue.js";

vi.mock("../lib/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolvePromise: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: () => {
      resolvePromise?.();
    },
  };
}

describe("bounded Signal receive queue", () => {
  it("retains complete lines when the queue reaches capacity", async () => {
    const firstStarted = deferred();
    const releaseFirst = deferred();
    const persisted: number[] = [];
    const queue = new BoundedReceiveQueue<number>(
      async (value) => {
        if (value === 1) {
          firstStarted.resolve();
          await releaseFirst.promise;
        }
        persisted.push(value);
      },
      2,
    );
    const framer = new JsonLineFramer(128, 128);

    expect(queue.enqueue(1)).toBe(true);
    await firstStarted.promise;
    framer.push(Buffer.from("2\n3\n4\n"), (line) =>
      queue.enqueue(Number.parseInt(line, 10)),
    );

    expect(queue.size).toBe(2);
    expect(framer.bufferedBytes).toBe(2);

    const flushPromise = framer.flush(
      (line) => queue.enqueue(Number.parseInt(line, 10)),
      () => queue.waitForCapacity(),
    );
    releaseFirst.resolve();
    await flushPromise;
    await queue.drain();

    expect(persisted).toEqual([1, 2, 3, 4]);
    expect(framer.bufferedBytes).toBe(0);
  });

  it("processes admitted payloads in FIFO order with one worker", async () => {
    const releaseFirst = deferred();
    const persisted: number[] = [];
    let first = true;
    const queue = new BoundedReceiveQueue<number>(
      async (value) => {
        if (first) {
          first = false;
          await releaseFirst.promise;
        }
        persisted.push(value);
      },
      3,
    );

    expect(queue.enqueue(1)).toBe(true);
    expect(queue.enqueue(2)).toBe(true);
    expect(queue.enqueue(3)).toBe(true);
    expect(queue.enqueue(4)).toBe(true);
    expect(queue.enqueue(5)).toBe(false);

    releaseFirst.resolve();
    await queue.drain();

    expect(persisted).toEqual([1, 2, 3, 4]);
  });

  it("rejects oversized lines and aggregate partial buffers", () => {
    const lineFramer = new JsonLineFramer(4, 32);
    expect(() =>
      lineFramer.push(Buffer.from("12345\n"), () => true),
    ).toThrow(ReceiveProtocolError);

    const bufferFramer = new JsonLineFramer(32, 5);
    bufferFramer.push(Buffer.from("123"), () => true);
    expect(() =>
      bufferFramer.push(Buffer.from("456"), () => true),
    ).toThrow(ReceiveProtocolError);
  });

  it("does not join an incomplete line with the next connection", () => {
    const first = new JsonLineFramer();
    const second = new JsonLineFramer();
    const lines: string[] = [];

    first.push(Buffer.from('{"id":1}'), (line) => {
      lines.push(line);
      return true;
    });
    first.close();
    second.push(Buffer.from('{"id":2}\n'), (line) => {
      lines.push(line);
      return true;
    });

    expect(lines).toEqual(['{"id":2}']);
  });

  it("caps retry backoff at one minute", async () => {
    let attempts = 0;
    const delays: number[] = [];

    await persistPayloadWithRetry(
      { method: "receive" },
      async () => {
        attempts++;
        if (attempts <= 7) {
          throw new Error("temporary failure");
        }
      },
      {
        wait: async (delayMs) => {
          delays.push(delayMs);
        },
      },
    );

    expect(attempts).toBe(8);
    expect(delays).toEqual([
      1_000,
      2_000,
      4_000,
      8_000,
      16_000,
      32_000,
      60_000,
    ]);
  });
});
