export const MAX_RECEIVE_QUEUE_PAYLOADS = 100;
export const MAX_RECEIVE_LINE_BYTES = 1024 * 1024;
export const MAX_RECEIVE_BUFFER_BYTES = 2 * 1024 * 1024;
export const RECEIVE_SOCKET_HIGH_WATER_MARK = 64 * 1024;

export type LineAdmission = (line: string) => boolean;

export class ReceiveProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReceiveProtocolError";
  }
}

export class BoundedReceiveQueue<T> {
  private readonly items: T[] = [];
  private readonly capacityWaiters: Array<() => void> = [];
  private readonly drainWaiters: Array<() => void> = [];
  private workerRunning = false;
  private accepting = true;

  constructor(
    private readonly persist: (item: T) => Promise<void>,
    private readonly maximumSize = MAX_RECEIVE_QUEUE_PAYLOADS,
    private readonly onCapacityAvailable: () => void = () => {},
  ) {}

  get size(): number {
    return this.items.length;
  }

  get hasCapacity(): boolean {
    return this.accepting && this.items.length < this.maximumSize;
  }

  enqueue(item: T): boolean {
    if (!this.hasCapacity) {
      return false;
    }

    this.items.push(item);
    void this.runWorker();
    return true;
  }

  waitForCapacity(): Promise<void> {
    if (this.hasCapacity) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.capacityWaiters.push(resolve);
    });
  }

  stopAccepting(): void {
    this.accepting = false;
  }

  drain(): Promise<void> {
    if (!this.workerRunning && this.items.length === 0) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.drainWaiters.push(resolve);
    });
  }

  private async runWorker(): Promise<void> {
    if (this.workerRunning) {
      return;
    }

    this.workerRunning = true;
    try {
      while (this.items.length > 0) {
        const item = this.items[0];
        this.items.splice(0, 1);

        this.resolveCapacityWaiters();
        await this.persist(item);
      }
    } finally {
      this.workerRunning = false;
      this.resolveDrainWaiters();
    }
  }

  private resolveCapacityWaiters(): void {
    const waiters = this.capacityWaiters.splice(0);
    for (const resolve of waiters) {
      resolve();
    }
    queueMicrotask(() => this.onCapacityAvailable());
  }

  private resolveDrainWaiters(): void {
    if (this.workerRunning || this.items.length > 0) {
      return;
    }

    const waiters = this.drainWaiters.splice(0);
    for (const resolve of waiters) {
      resolve();
    }
  }
}

export class JsonLineFramer {
  private buffer = Buffer.alloc(0);
  private closed = false;

  constructor(
    private readonly maximumLineBytes = MAX_RECEIVE_LINE_BYTES,
    private readonly maximumBufferBytes = MAX_RECEIVE_BUFFER_BYTES,
  ) {}

  get bufferedBytes(): number {
    return this.buffer.length;
  }

  push(chunk: Buffer, admit: LineAdmission): void {
    if (this.closed) {
      throw new ReceiveProtocolError("Cannot append data to a closed framer");
    }
    if (this.buffer.length + chunk.length > this.maximumBufferBytes) {
      throw new ReceiveProtocolError(
        `Receive buffer exceeds ${this.maximumBufferBytes} bytes`,
      );
    }

    this.buffer = Buffer.concat([this.buffer, chunk]);
    this.drainAvailable(admit);
  }

  async flush(
    admit: LineAdmission,
    waitForCapacity: () => Promise<void>,
  ): Promise<void> {
    while (this.hasCompleteLine()) {
      const line = this.peekLine();
      if (!admit(line)) {
        await waitForCapacity();
        continue;
      }

      this.consumeLine();
    }
  }

  close(): void {
    this.closed = true;
    this.buffer = Buffer.alloc(0);
  }

  private drainAvailable(admit: LineAdmission): void {
    while (this.hasCompleteLine()) {
      const line = this.peekLine();
      if (!admit(line)) {
        return;
      }

      this.consumeLine();
    }
    this.validatePartialLine();
  }

  private hasCompleteLine(): boolean {
    return this.buffer.indexOf(0x0a) >= 0;
  }

  private peekLine(): string {
    const newlineIndex = this.buffer.indexOf(0x0a);
    if (newlineIndex < 0) {
      throw new ReceiveProtocolError("Expected a complete JSON-RPC line");
    }

    const lineBytes = this.buffer.subarray(0, newlineIndex);
    if (lineBytes.length > this.maximumLineBytes) {
      throw new ReceiveProtocolError(
        `Receive line exceeds ${this.maximumLineBytes} bytes`,
      );
    }

    const contentBytes =
      lineBytes[lineBytes.length - 1] === 0x0d
        ? lineBytes.subarray(0, lineBytes.length - 1)
        : lineBytes;
    return contentBytes.toString("utf8");
  }

  private validatePartialLine(): void {
    if (!this.hasCompleteLine() && this.buffer.length > this.maximumLineBytes) {
      throw new ReceiveProtocolError(
        `Receive line exceeds ${this.maximumLineBytes} bytes`,
      );
    }
  }

  private consumeLine(): void {
    const newlineIndex = this.buffer.indexOf(0x0a);
    if (newlineIndex < 0) {
      throw new ReceiveProtocolError("Expected a complete JSON-RPC line");
    }

    this.buffer = this.buffer.subarray(newlineIndex + 1);
  }
}
