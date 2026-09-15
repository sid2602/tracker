import { describe, expect, it } from "vitest";
import { loadConfig } from "../../../../config.js";
import { parseTrainingLog } from "./parser.js";

const REFERENCE_DATE = "2026-09-14";

describe.runIf(process.env.RUN_EVALS === "true")(
  "LLM Training Log Parser Evals",
  () => {
    let config: ReturnType<typeof loadConfig>;

    try {
      config = loadConfig();
    } catch (error) {
      if (process.env.RUN_EVALS === "true") {
        console.error(
          "Could not load config for evals. Ensure .env has valid API keys (e.g., AI_GATEWAY_API_KEY).",
        );
        throw error;
      }
    }

    it("parses a single completed set in Polish", async () => {
      const result = await parseTrainingLog(
        config,
        "podciąganie 8",
        REFERENCE_DATE,
      );
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]).toMatchObject({
        exercise: expect.stringMatching(/podciąg/i),
        reps: 8,
        setsCount: null,
        occurredOn: REFERENCE_DATE,
      });
    }, 15000);

    it("parses a single completed set in English", async () => {
      const result = await parseTrainingLog(
        config,
        "pull-ups 8 today",
        REFERENCE_DATE,
      );
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]).toMatchObject({
        reps: 8,
        setsCount: null,
        occurredOn: REFERENCE_DATE,
      });
      expect(result.entries[0]?.exercise.length).toBeGreaterThan(0);
    }, 15000);

    it("parses an NxR prescription without inventing separate set rows", async () => {
      const result = await parseTrainingLog(
        config,
        "przysiad 3x8 80kg",
        REFERENCE_DATE,
      );
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]).toMatchObject({
        exercise: expect.stringMatching(/przysiad/i),
        reps: 8,
        setsCount: 3,
        weightGrams: 80000,
        occurredOn: REFERENCE_DATE,
      });
    }, 15000);

    it("parses an English NxR prescription", async () => {
      const result = await parseTrainingLog(
        config,
        "squat 3x8 80kg",
        REFERENCE_DATE,
      );
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]).toMatchObject({
        reps: 8,
        setsCount: 3,
        weightGrams: 80000,
      });
    }, 15000);

    it("parses an EMOM / non-strength example", async () => {
      const result = await parseTrainingLog(
        config,
        "EMOM 12: thruster 15",
        REFERENCE_DATE,
      );
      expect(result.entries.length).toBeGreaterThanOrEqual(1);
      const entry = result.entries[0];
      expect(entry?.exercise.toLowerCase()).toMatch(/thruster/);
      expect(entry?.kind === "emom" || entry?.reps === 15).toBe(true);
    }, 15000);

    it("parses cardio with duration", async () => {
      const result = await parseTrainingLog(
        config,
        "bieganie 20 min",
        REFERENCE_DATE,
      );
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]?.durationSeconds).toBe(1200);
      expect(
        result.entries[0]?.kind === "cardio" ||
          result.entries[0]?.durationSeconds === 1200,
      ).toBe(true);
    }, 15000);
  },
);
