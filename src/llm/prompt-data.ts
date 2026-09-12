import { UserInputError } from "../worker/errors.js";

export const MAX_USER_PROMPT_DATA_CHARACTERS = 6000;
export const MAX_CATEGORY_CATALOG_DATA_CHARACTERS = 4000;
export const MAX_TOTAL_PROMPT_CHARACTERS = 12000;

export type PromptJsonValue =
  | string
  | number
  | boolean
  | null
  | readonly PromptJsonValue[]
  | { readonly [key: string]: PromptJsonValue };

export type PromptDataSource = "user" | "internal";

export type PromptDataOptions = {
  readonly label: string;
  readonly maxCharacters: number;
  readonly source: PromptDataSource;
  readonly tooLargeMessage?: string;
};

export class PromptDataError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "PromptDataError";
  }
}

export function renderPromptDataBlock(
  value: PromptJsonValue,
  options: PromptDataOptions,
): string {
  const serialized = serializePromptData(value, options);
  const escaped = escapePromptDataMarkers(serialized);
  if (escaped.length > options.maxCharacters) {
    throwDataError(
      options,
      options.tooLargeMessage ??
        `${options.label} exceeds ${options.maxCharacters} characters`,
    );
  }

  return [
    `--- BEGIN ${options.label} JSON ---`,
    escaped,
    `--- END ${options.label} JSON ---`,
  ].join("\n");
}

export function assertPromptLength(
  prompt: string,
  maxCharacters: number,
  label: string,
): string {
  if (prompt.length > maxCharacters) {
    throw new PromptDataError(
      `${label} exceeds ${maxCharacters} characters`,
    );
  }

  return prompt;
}

export function containsPromptInjectionMarker(text: string): boolean {
  const normalized = text
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/\s+/gu, " ");

  return (
    /(?:ignore|disregard|forget)(?=$|[^\p{L}]).{0,80}(?:previous|prior|above)(?=$|[^\p{L}])/u.test(
      normalized,
    ) ||
    /(?:ignoruj|zignoruj|pomiń|pomin|omiń|omin)(?=$|[^\p{L}]).{0,80}(?:poprzednie|wcześniejsze|wczesniejsze)(?=$|[^\p{L}])/u.test(
      normalized,
    )
  );
}

export function isPromptJsonValue(value: unknown): value is PromptJsonValue {
  return !hasUnsupportedPromptValue(value, new WeakSet<object>());
}

function serializePromptData(
  value: PromptJsonValue,
  options: PromptDataOptions,
): string {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch (error: unknown) {
    throwDataError(
      options,
      `Could not serialize ${options.label} prompt data`,
      error,
    );
  }

  if (serialized === undefined) {
    throwDataError(
      options,
      `Could not serialize ${options.label} prompt data`,
    );
  }

  if (!isPromptJsonValue(value)) {
    throwDataError(
      options,
      `Could not serialize ${options.label} prompt data because it contains an unsupported value`,
    );
  }

  return serialized;
}

function hasUnsupportedPromptValue(
  value: unknown,
  seen: WeakSet<object>,
): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return false;
  }
  if (typeof value === "number") {
    return !Number.isFinite(value);
  }
  if (typeof value !== "object") {
    return true;
  }
  if (seen.has(value)) {
    return false;
  }

  if (Array.isArray(value)) {
    seen.add(value);
    return value.some((item) => hasUnsupportedPromptValue(item, seen));
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return true;
  }

  seen.add(value);
  return Object.values(value).some((item) =>
    hasUnsupportedPromptValue(item, seen),
  );
}

function throwDataError(
  options: PromptDataOptions,
  message: string,
  cause?: unknown,
): never {
  if (options.source === "user") {
    throw new UserInputError(message, cause);
  }

  throw new PromptDataError(message, cause);
}

function escapePromptDataMarkers(serialized: string): string {
  return serialized.replace(
    /--- (BEGIN|END) ([^\r\n]*?) ---/gu,
    (_match: string, direction: string, label: string): string =>
      `[escaped ${direction} ${label}]`,
  );
}
