export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 2,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts - 1) {
        const delayMs = Math.pow(2, attempt) * 500; // 500ms, 1000ms, etc.
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new Error("LLM call failed after retry");
}
