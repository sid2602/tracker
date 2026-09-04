import { describe, expect, it } from "vitest";
import { loadConfig } from "../../config.js";
import { parseCategoryAction } from "./parser.js";

describe.runIf(process.env.RUN_EVALS === "true")("LLM Category Parser Evals", () => {
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

  it("parses add category with description in English", async () => {
    const result = await parseCategoryAction(
      config,
      "add category subscriptions for netflix and spotify",
    );
    expect(result.action).toBe("add");
    expect(result.categoryName).toBe("subscriptions");
    expect(result.description?.toLowerCase()).toContain("netflix");
    expect(result.description?.toLowerCase()).toContain("spotify");
  }, 15000);

  it("parses remove category in English", async () => {
    const result = await parseCategoryAction(
      config,
      "delete the food category",
    );
    expect(result.action).toBe("remove");
    expect(result.categoryName).toBe("food");
  }, 15000);

  it("parses list categories in English", async () => {
    const result = await parseCategoryAction(
      config,
      "what categories do I have?",
    );
    expect(result.action).toBe("list");
    // categoryName is nullable for list actions, but could be null or undefined
    expect(result.categoryName).toBeNull();
  }, 15000);

  it("parses create category with examples in English", async () => {
    const result = await parseCategoryAction(
      config,
      "create a new category for holidays, like flights and hotels",
    );
    expect(result.action).toBe("add");
    expect(result.categoryName).toBe("holidays");
    expect(result.description).toContain("flights");
    expect(result.description).toContain("hotels");
  }, 15000);

  it("parses simple add category question in English", async () => {
    const result = await parseCategoryAction(
      config,
      "can you add dining out category?",
    );
    expect(result.action).toBe("add");
    expect(result.categoryName).toContain("dining");
  }, 15000);

  it("parses remove category straightforwardly in English", async () => {
    const result = await parseCategoryAction(
      config,
      "remove category subscriptions",
    );
    expect(result.action).toBe("remove");
    expect(result.categoryName).toBe("subscriptions");
  }, 15000);

  it("parses show categories request in English", async () => {
    const result = await parseCategoryAction(
      config,
      "show me all the categories I have right now",
    );
    expect(result.action).toBe("list");
    expect(result.categoryName).toBeNull();
  }, 15000);

  // --- POLISH TEST CASES (Translation Checks) ---

  it("parses and translates add category in Polish", async () => {
    const result = await parseCategoryAction(
      config,
      "dodaj kategorię rachunki, to znaczy prąd, czynsz i woda",
    );
    expect(result.action).toBe("add");
    // Should be translated to English
    expect(result.categoryName).toBe("bills");
    // The description should also be translated
    expect(result.description?.toLowerCase()).toContain("electricity");
    expect(result.description?.toLowerCase()).toContain("rent");
    expect(result.description?.toLowerCase()).toContain("water");
  }, 15000);

  it("parses and translates remove category in Polish", async () => {
    const result = await parseCategoryAction(
      config,
      "usun kategorie transport",
    );
    expect(result.action).toBe("remove");
    // Should be strictly lowercase as per prompt/schema
    expect(result.categoryName).toBe("transport");
  }, 15000);

  it("parses list categories in Polish", async () => {
    const result = await parseCategoryAction(
      config,
      "pokaż moje kategorie",
    );
    expect(result.action).toBe("list");
    expect(result.categoryName).toBeNull();
  }, 15000);
});
