import { describe, expect, it } from "vitest";
import { isUserInputError, UserInputError } from "./errors.js";

describe("processing errors", () => {
  it("identifies user input errors", () => {
    const error = new UserInputError("Please add an amount.");

    expect(isUserInputError(error)).toBe(true);
    expect(error.userMessage).toBe("Please add an amount.");
  });

  it("does not classify ordinary errors as user input", () => {
    expect(isUserInputError(new Error("gateway unavailable"))).toBe(false);
  });
});
