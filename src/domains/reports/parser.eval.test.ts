import { describe, expect, it } from "vitest";
import { loadConfig } from "../../config.js";
import { parseReport } from "./parser.js";

const REFERENCE_DATE = "2026-09-04";

describe.runIf(process.env.RUN_EVALS === "true")("LLM Report Parser Evals", () => {
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

  it("parses exact day request in English", async () => {
    const result = await parseReport(config, "how much did I spend today?", REFERENCE_DATE);
    expect(result.start_date).toMatch(/^\d{4}-09-04$/);
    expect(result.end_date).toMatch(/^\d{4}-09-04$/);
    expect(result.group_by).toBe("total");
    if (result.categories !== undefined) {
      expect(result.categories).toHaveLength(0);
    }
  }, 15000);

  it("parses category filter and explicit month in English", async () => {
    const result = await parseReport(config, "report for groceries in August", REFERENCE_DATE);
    expect(result.start_date).toMatch(/^\d{4}-08-01$/);
    expect(result.end_date).toMatch(/^\d{4}-08-31$/);
    expect(result.group_by).toBe("total");
    expect(result.categories).toBeDefined();
    expect(result.categories?.map(c => c.toLowerCase())).toContain("groceries");
  }, 15000);

  it("parses multiple categories and defaults to current month in English", async () => {
    const result = await parseReport(config, "what did I spend on food and transport?", REFERENCE_DATE);
    expect(result.start_date).toMatch(/^\d{4}-09-01$/); // Default to current month
    expect(result.end_date).toMatch(/^\d{4}-09-30$/);
    expect(result.categories).toBeDefined();
    expect(result.categories?.map(c => c.toLowerCase())).toContain("food");
    expect(result.categories?.map(c => c.toLowerCase())).toContain("transport");
  }, 15000);

  // --- POLISH TEST CASES ---

  it("parses explicit month request in Polish", async () => {
    const result = await parseReport(config, "podsumowanie wydatków za sierpień", REFERENCE_DATE);
    expect(result.start_date).toMatch(/^\d{4}-08-01$/);
    expect(result.end_date).toMatch(/^\d{4}-08-31$/);
    expect(result.group_by).toBe("total");
  }, 15000);

  it("parses group by category with typo in Polish", async () => {
    const result = await parseReport(config, "pokaz wydatki z podziałem na kategorie dzidiaj", REFERENCE_DATE);
    expect(result.start_date).toMatch(/^\d{4}-09-04$/); // dzidiaj -> dzisiaj -> today
    expect(result.end_date).toMatch(/^\d{4}-09-04$/);
    expect(result.group_by).toBe("category");
  }, 15000);

  it("defaults to current month for unspecified query in Polish", async () => {
    const result = await parseReport(config, "ile wydalem", REFERENCE_DATE);
    expect(result.start_date).toMatch(/^\d{4}-09-01$/);
    expect(result.end_date).toMatch(/^\d{4}-09-30$/);
    expect(result.group_by).toBe("total");
  }, 15000);
});
