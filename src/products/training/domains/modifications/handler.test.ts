import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Config } from "../../../../config.js";
import {
  createTestConfig,
  createTestDatabase,
  createTestDeps,
} from "../../../../test/fixtures.js";
import type { AppDeps } from "../../../../worker/types.js";
import { handleTrainingModification } from "./handler.js";
import type { TrainingModificationResult } from "./schema.js";
import { insertTrainingEntries } from "../entries/repository.js";

const TEST_SOURCE_AUTHOR = "+48000000000";
const REFERENCE_DATE = "2026-09-15";

const parseTrainingModificationMock = vi.fn<
  (config: Config, text: string, referenceDate: string) => Promise<TrainingModificationResult>
>();

vi.mock("./parser.js", () => ({
  parseTrainingModification: (
    config: Config,
    text: string,
    referenceDate: string,
  ) => parseTrainingModificationMock(config, text, referenceDate),
}));

vi.mock("../../../../lib/logger.js", () => ({
  logger: {
    info: vi.fn(),
  },
}));

describe("handleTrainingModification", () => {
  let deps: AppDeps;

  beforeEach(async () => {
    const db = await createTestDatabase();
    deps = createTestDeps(db, {
      config: createTestConfig(),
      now: () => new Date(`${REFERENCE_DATE}T12:00:00.000Z`),
    });
    parseTrainingModificationMock.mockReset();

    await insertTrainingEntries(db, [
      {
        sourceMessageKey: "msg-1",
        sourceAuthor: TEST_SOURCE_AUTHOR,
        sourceTimestamp: 100,
        itemIndex: 0,
        occurredOn: REFERENCE_DATE,
        exercise: "podciąganie",
        setIndex: 1,
        reps: 8,
        weightGrams: null,
        durationSeconds: null,
        kind: "strength",
        note: "",
        rawText: "podciąganie 3x8",
      },
      {
        sourceMessageKey: "msg-1",
        sourceAuthor: TEST_SOURCE_AUTHOR,
        sourceTimestamp: 100,
        itemIndex: 1,
        occurredOn: REFERENCE_DATE,
        exercise: "podciąganie",
        setIndex: 2,
        reps: 8,
        weightGrams: null,
        durationSeconds: null,
        kind: "strength",
        note: "",
        rawText: "podciąganie 3x8",
      },
      {
        sourceMessageKey: "msg-1",
        sourceAuthor: TEST_SOURCE_AUTHOR,
        sourceTimestamp: 100,
        itemIndex: 2,
        occurredOn: REFERENCE_DATE,
        exercise: "podciąganie",
        setIndex: 3,
        reps: 8,
        weightGrams: null,
        durationSeconds: null,
        kind: "strength",
        note: "",
        rawText: "podciąganie 3x8",
      },
    ]);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await deps.db.destroy();
  });

  it("corrects set 3 to 7 reps", async () => {
    parseTrainingModificationMock.mockResolvedValue({
      action: "correct_set",
      target: "set",
      setIndex: 3,
      id: null,
      updatePayload: { reps: 7, weightGrams: null, durationSeconds: null },
    });

    const result = await handleTrainingModification(deps, {
      messageKey: "msg-2",
      sourceAuthor: TEST_SOURCE_AUTHOR,
      sourceTimestamp: 200,
      rawText: "3 seria 7",
    });

    expect(result).toEqual({
      kind: "success",
      message: "Updated podciąganie set 3 to 7 reps.",
    });

    const rows = await deps.db
      .selectFrom("training_entries")
      .select(["set_index", "reps"])
      .orderBy("item_index", "asc")
      .execute();
    expect(rows).toEqual([
      { set_index: 1, reps: 8 },
      { set_index: 2, reps: 8 },
      { set_index: 3, reps: 7 },
    ]);
  });

  it("deletes the last training entry", async () => {
    parseTrainingModificationMock.mockResolvedValue({
      action: "delete",
      target: "last",
      setIndex: null,
      id: null,
      updatePayload: null,
    });

    const result = await handleTrainingModification(deps, {
      messageKey: "msg-3",
      sourceAuthor: TEST_SOURCE_AUTHOR,
      sourceTimestamp: 201,
      rawText: "usuń ostatni wpis treningowy",
    });

    expect(result.kind).toBe("success");
    const rows = await deps.db
      .selectFrom("training_entries")
      .selectAll()
      .execute();
    expect(rows).toHaveLength(2);
  });

  it("fail-closes when there is nothing to delete", async () => {
    await deps.db.deleteFrom("training_entries").execute();
    parseTrainingModificationMock.mockResolvedValue({
      action: "delete",
      target: "last",
      setIndex: null,
      id: null,
      updatePayload: null,
    });

    const result = await handleTrainingModification(deps, {
      messageKey: "msg-4",
      sourceAuthor: TEST_SOURCE_AUTHOR,
      sourceTimestamp: 202,
      rawText: "delete last training entry",
    });

    expect(result).toEqual({
      kind: "success",
      message: "Could not find any training entry matching this description.",
    });
  });
});
