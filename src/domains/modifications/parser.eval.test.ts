import { describe, expect, it } from "vitest";
import { loadConfig } from "../../config.js";
import { parseModification } from "./parser.js";

describe.runIf(process.env.RUN_EVALS === "true")("LLM Modification Parser Evals", () => {
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

  // --- ENGLISH TEST CASES ---

  it("parses delete last in English (undo last expense)", async () => {
    const result = await parseModification(config, "undo last expense");
    expect(result.action).toBe("delete");
    expect(result.target).toBe("last");
  }, 15000);

  it("parses delete by ID in English (delete expense #105)", async () => {
    const result = await parseModification(config, "delete expense #105");
    expect(result.action).toBe("delete");
    expect(result.target).toBe("id");
    expect(result.id).toBe(105);
  }, 15000);

  it("parses delete by keyword in English (delete the coffee expense)", async () => {
    const result = await parseModification(config, "delete the coffee expense");
    expect(result.action).toBe("delete");
    expect(result.target).toBe("specific");
    expect(result.searchCriteria).toBeDefined();
    expect(result.searchCriteria?.keyword?.toLowerCase()).toContain("coffee");
  }, 15000);

  it("parses update amount of last expense in English (change the last expense amount to 120 pln)", async () => {
    const result = await parseModification(config, "change the last expense amount to 120 pln");
    expect(result.action).toBe("update");
    expect(result.target).toBe("last");
    expect(result.updatePayload).toBeDefined();
    expect(result.updatePayload?.amountCents).toBe(12000);
  }, 15000);

  // --- POLISH TEST CASES ---

  it("parses delete last in Polish (cofnij)", async () => {
    const result = await parseModification(config, "cofnij");
    expect(result.action).toBe("delete");
    expect(result.target).toBe("last");
  }, 15000);

  it("parses delete by ID in Polish (usuń wpis nr 42)", async () => {
    const result = await parseModification(config, "usuń wpis nr 42");
    expect(result.action).toBe("delete");
    expect(result.target).toBe("id");
    expect(result.id).toBe(42);
  }, 15000);

  it("parses delete by search criteria in Polish (usuń ten obiad za 50 zł)", async () => {
    const result = await parseModification(config, "usuń ten obiad za 50 zł");
    expect(result.action).toBe("delete");
    expect(result.target).toBe("specific");
    expect(result.searchCriteria).toBeDefined();
    expect(result.searchCriteria?.amountCents).toBe(5000);
    expect(result.searchCriteria?.keyword?.toLowerCase()).toContain("obiad");
  }, 15000);

  it("parses update category by ID in Polish (zmień kategorię wpisu nr 10 na transport)", async () => {
    const result = await parseModification(config, "zmień kategorię wpisu nr 10 na transport");
    expect(result.action).toBe("update");
    expect(result.target).toBe("id");
    expect(result.id).toBe(10);
    expect(result.updatePayload).toBeDefined();
    expect(result.updatePayload?.category).toBe("transport");
  }, 15000);
});
