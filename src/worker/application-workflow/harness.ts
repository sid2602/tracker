import { expect, vi } from "vitest";
import { z } from "zod";
import type { Kysely } from "kysely";
import type { Config } from "../../config.js";
import { initSchema, openDatabase } from "../../db/connection.js";
import type { AppDatabase, InboxTable } from "../../db/schema.js";
import type { AppDeps } from "../types.js";

type GenerateStructured = typeof import("../../llm/generate.js").generateStructured;
type SendMessage = typeof import("../../signal/index.js").sendMessage;
type GenerateStructuredArgs = Parameters<GenerateStructured>;

type ScriptedLlmResult = {
  output: unknown;
  promptIncludes: readonly string[];
  error?: Error;
};

export type LlmCall = {
  operation: string;
  prompt: string;
};

export type SentMessage = {
  recipient: string;
  message: string;
};

export const TEST_PHONE_NUMBER = "+15005550100";
export const TEST_DEVICE_ID = 1;
export const REFERENCE_DATE = "2026-09-15";
export const REFERENCE_NOW_MS = Date.parse(`${REFERENCE_DATE}T12:00:00.000Z`);
export const FIRST_MESSAGE_TIMESTAMP = 1_700_000_000_000;

const generateStructuredMock = vi.fn<GenerateStructured>();
const sendMessageMock = vi.fn<SendMessage>();

vi.mock("../../llm/generate.js", () => ({
  generateStructured: (...args: GenerateStructuredArgs) =>
    generateStructuredMock(...args),
}));

vi.mock("../../signal/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../signal/index.js")>();
  return {
    ...actual,
    sendMessage: (...args: Parameters<SendMessage>) =>
      sendMessageMock(...args),
  };
});

vi.mock("../../tracing.js", () => ({
  withMessageTrace: async (
    _attributes: unknown,
    callback: () => Promise<void>,
  ): Promise<void> => callback(),
  recordMessageTrace: vi.fn(),
}));

vi.mock("../../lib/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const llmScripts = new Map<string, ScriptedLlmResult[]>();
const llmCalls: LlmCall[] = [];

generateStructuredMock.mockImplementation(
  async <T>(
    _config: Config,
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
    prompt: string,
    operation: string,
  ): Promise<T> => {
    const scripts = llmScripts.get(operation);
    const script = scripts?.shift();
    if (!script) {
      throw new Error(`No remaining scripted LLM result for ${operation}`);
    }

    for (const expectedText of script.promptIncludes) {
      if (!prompt.includes(expectedText)) {
        throw new Error(
          `Prompt for ${operation} did not include expected text: ${expectedText}`,
        );
      }
    }

    llmCalls.push({ operation, prompt });

    if (script.error) {
      throw script.error;
    }

    return schema.parse(script.output);
  },
);

const baseConfig: Config = {
  aiGatewayApiKey: "test-gateway-key",
  llmProvider: "openai",
  llmModel: "gpt-4o-mini",
  databasePath: ":memory:",
  signalRpcHost: "signal-cli-not-used",
  signalRpcPort: 6001,
  signalPhoneNumber: TEST_PHONE_NUMBER,
  signalAllowedInputDeviceIds: [TEST_DEVICE_ID],
  langfusePublicKey: null,
  langfuseSecretKey: null,
  langfuseBaseUrl: "https://cloud.langfuse.com",
};

let inboxModulePromise: Promise<typeof import("../inbox.js")> | undefined;
let activeHarness = false;

async function getInboxModule(): Promise<typeof import("../inbox.js")> {
  inboxModulePromise ??= import("../inbox.js");
  return inboxModulePromise;
}

export type WorkflowHarness = {
  db: Kysely<AppDatabase>;
  config: Config;
  deps: AppDeps;
  scriptLlm(
    operation: string,
    output: unknown,
    promptIncludes?: readonly string[],
  ): void;
  scriptLlmFailure(
    operation: string,
    error: Error,
    promptIncludes?: readonly string[],
  ): void;
  failNextSignalSend(error: Error): void;
  runWorkflow(rawText: string, timestamp?: number): Promise<void>;
  processNext(): Promise<boolean>;
  advanceTime(milliseconds: number): void;
  getInboxItems(): Promise<InboxTable[]>;
  getLlmCalls(): readonly LlmCall[];
  getSentMessages(): readonly SentMessage[];
  getSendCallCount(): number;
  expectConfirmed(responseText: string, expectedSendCount?: number): Promise<void>;
  expectIgnored(): Promise<void>;
  expectLlmCallSequence(...operations: string[]): void;
  close(): Promise<void>;
};

export async function createWorkflowHarness(): Promise<WorkflowHarness> {
  if (activeHarness) {
    throw new Error(
      "Only one workflow harness may be active per Vitest module; do not use it.concurrent",
    );
  }
  activeHarness = true;

  const db = openDatabase(":memory:");
  try {
    await initSchema(db);
  } catch (error: unknown) {
    activeHarness = false;
    await db.destroy();
    throw error;
  }

  let nowMs = REFERENCE_NOW_MS;
  const config = { ...baseConfig };
  const deps: AppDeps = {
    db,
    config,
    now: () => new Date(nowMs),
  };
  const sentMessages: SentMessage[] = [];
  let closed = false;

  llmScripts.clear();
  llmCalls.length = 0;
  generateStructuredMock.mockClear();
  sendMessageMock.mockReset();
  sendMessageMock.mockImplementation(
    async (_config, recipient, message): Promise<void> => {
      sentMessages.push({ recipient, message });
    },
  );

  const scriptLlm = (
    operation: string,
    output: unknown,
    promptIncludes: readonly string[] = [],
    error?: Error,
  ): void => {
    const scripts = llmScripts.get(operation) ?? [];
    scripts.push({ output, promptIncludes, error });
    llmScripts.set(operation, scripts);
  };

  const scriptLlmFailure = (
    operation: string,
    error: Error,
    promptIncludes: readonly string[] = [],
  ): void => {
    scriptLlm(operation, undefined, promptIncludes, error);
  };

  const failNextSignalSend = (error: Error): void => {
    sendMessageMock.mockImplementationOnce(
      async (_config, recipient, message): Promise<void> => {
        sentMessages.push({ recipient, message });
        throw error;
      },
    );
  };

  const runWorkflow = async (
    rawText: string,
    timestamp: number = FIRST_MESSAGE_TIMESTAMP,
  ): Promise<void> => {
    const inbox = await getInboxModule();
    await inbox.saveToInbox(deps, {
      envelope: {
        source: TEST_PHONE_NUMBER,
        sourceDevice: TEST_DEVICE_ID,
        timestamp,
        dataMessage: {
          message: rawText,
        },
      },
    });

    await expect(inbox.processNextInboxItem(deps)).resolves.toBe(true);
  };

  const processNext = async (): Promise<boolean> => {
    const inbox = await getInboxModule();
    return inbox.processNextInboxItem(deps);
  };

  const getInboxItems = async (): Promise<InboxTable[]> =>
    db
      .selectFrom("inbox")
      .selectAll()
      .orderBy("receive_sequence", "asc")
      .execute();

  const getLlmCalls = (): readonly LlmCall[] => [...llmCalls];
  const getSentMessages = (): readonly SentMessage[] => [...sentMessages];
  const getSendCallCount = (): number => sendMessageMock.mock.calls.length;

  const expectConfirmed = async (
    responseText: string,
    expectedSendCount: number = 1,
  ): Promise<void> => {
    const inboxItems = await getInboxItems();
    expect(inboxItems).toHaveLength(1);
    const inboxItem = inboxItems[0];
    if (!inboxItem) {
      throw new Error("Expected one confirmed inbox item");
    }

    expect(inboxItem.status).toBe("confirmed");
    expect(inboxItem.response_text).toBe(responseText);
    expect(getSendCallCount()).toBe(expectedSendCount);
    expect(sentMessages.at(-1)).toEqual({
      recipient: TEST_PHONE_NUMBER,
      message: responseText,
    });
  };

  const expectIgnored = async (): Promise<void> => {
    const inboxItems = await getInboxItems();
    expect(inboxItems).toHaveLength(1);
    expect(inboxItems[0]?.status).toBe("ignored");
    expect(inboxItems[0]?.response_text).toBeNull();
    expect(getSendCallCount()).toBe(0);
  };

  const expectLlmCallSequence = (...operations: string[]): void => {
    expect(llmCalls.map((call) => call.operation)).toEqual(operations);
    expect(Array.from(llmScripts.values()).flat()).toHaveLength(0);
  };

  return {
    db,
    config,
    deps,
    scriptLlm,
    scriptLlmFailure,
    failNextSignalSend,
    runWorkflow,
    processNext,
    advanceTime: (milliseconds: number): void => {
      nowMs += milliseconds;
    },
    getInboxItems,
    getLlmCalls,
    getSentMessages,
    getSendCallCount,
    expectConfirmed,
    expectIgnored,
    expectLlmCallSequence,
    close: async (): Promise<void> => {
      if (closed) {
        return;
      }
      closed = true;
      activeHarness = false;
      await db.destroy();
    },
  };
}
