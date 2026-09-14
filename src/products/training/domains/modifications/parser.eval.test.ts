import { describe, expect, it } from "vitest";
import { loadConfig } from "../../../../config.js";
import { parseTrainingModification } from "./parser.js";

const REFERENCE_DATE = "2026-09-15";

describe.runIf(process.env.RUN_EVALS === "true")(
  "LLM Training Modification Parser Evals",
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

    it("parses Polish numbered set correction deterministically", async () => {
      const result = await parseTrainingModification(
        config,
        "3 seria 7",
        REFERENCE_DATE,
      );
      expect(result).toMatchObject({
        action: "correct_set",
        setIndex: 3,
        updatePayload: { reps: 7 },
      });
    }, 15000);

    it("parses English last-set correction", async () => {
      const result = await parseTrainingModification(
        config,
        "last set 7",
        REFERENCE_DATE,
      );
      expect(result).toMatchObject({
        action: "correct_set",
        setIndex: null,
        updatePayload: { reps: 7 },
      });
    }, 15000);

    it("parses delete last training entry in Polish", async () => {
      const result = await parseTrainingModification(
        config,
        "usuń ostatni wpis treningowy",
        REFERENCE_DATE,
      );
      expect(result.action).toBe("delete");
      expect(result.target).toBe("last");
    }, 15000);

    it("parses delete by id in English", async () => {
      const result = await parseTrainingModification(
        config,
        "delete training entry #12",
        REFERENCE_DATE,
      );
      expect(result).toMatchObject({
        action: "delete",
        target: "id",
        id: 12,
      });
    }, 15000);
  },
);
