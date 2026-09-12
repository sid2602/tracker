import { describe, expect, it } from "vitest";
import {
  createTestConfig,
  createTestDatabase,
} from "./fixtures.js";

describe("test fixtures", () => {
  it("provides stable defaults with focused overrides", () => {
    const config = createTestConfig({
      signalRpcPort: 6123,
      signalAllowedInputDeviceIds: [2],
    });
    const secondConfig = createTestConfig();
    config.signalAllowedInputDeviceIds.push(3);

    expect(config).toMatchObject({
      aiGatewayApiKey: "test-gateway-key",
      signalRpcPort: 6123,
      signalAllowedInputDeviceIds: [2, 3],
    });
    expect(config.llmModel).toBe("gpt-4o-mini");
    expect(secondConfig.signalAllowedInputDeviceIds).toEqual([1]);
  });

  it("creates isolated base and fully initialized databases", async () => {
    const baseDb = await createTestDatabase("base");
    const fullDb = await createTestDatabase();

    await expect(
      baseDb.selectFrom("categories").selectAll().execute(),
    ).resolves.toEqual([]);
    await expect(
      fullDb.selectFrom("categories").selectAll().execute(),
    ).resolves.toHaveLength(9);

    await baseDb.destroy();
    await fullDb.destroy();
  });
});
