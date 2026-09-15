import { z } from "zod";

const MAX_SELECTOR_TEXT_LENGTH = 200;

const occurredOnSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isValidCalendarDate, "Date must be a valid calendar date");

export const modificationSearchSchema = z.object({
  category: z
    .string()
    .trim()
    .min(1)
    .max(MAX_SELECTOR_TEXT_LENGTH)
    .nullish()
    .describe("Exact category name to filter by"),
  amountCents: z
    .number()
    .int()
    .positive()
    .safe()
    .nullish()
    .describe("Amount in cents to filter by (e.g. 50 PLN -> 5000)"),
  keyword: z
    .string()
    .trim()
    .min(1)
    .max(MAX_SELECTOR_TEXT_LENGTH)
    .nullish()
    .describe("Keyword to search in notes or raw text"),
  occurredOn: occurredOnSchema
    .nullish()
    .describe("Exact expense date in YYYY-MM-DD format"),
});

export const modificationUpdatePayloadSchema = z.object({
  category: z.string().trim().min(1).max(MAX_SELECTOR_TEXT_LENGTH).nullish(),
  amountCents: z.number().int().positive().safe().nullish(),
});

const modificationResultBaseSchema = z.object({
  action: z.enum(["delete", "update"]),
  target: z.enum(["last", "specific", "id"]),
  searchCriteria: modificationSearchSchema.nullish(),
  selection: z
    .enum(["first", "last"])
    .nullish()
    .describe("Selection operator for filtered specific results"),
  id: z
    .number()
    .int()
    .positive()
    .safe()
    .nullish()
    .describe("Positive expense ID if target is 'id'"),
  updatePayload: modificationUpdatePayloadSchema.nullish(),
});

export const modificationResultSchema = modificationResultBaseSchema.superRefine(
  (value, ctx) => {
    if (value.target === "id") {
      if (value.id === null || value.id === undefined) {
        addIssue(ctx, ["id"], "An expense ID is required for the id target");
      }
      if (value.searchCriteria !== null && value.searchCriteria !== undefined) {
        addIssue(ctx, ["searchCriteria"], "ID targets cannot have search criteria");
      }
      if (value.selection !== null && value.selection !== undefined) {
        addIssue(ctx, ["selection"], "ID targets cannot have a selection operator");
      }
    }

    if (value.target === "last") {
      if (value.id !== null && value.id !== undefined) {
        addIssue(ctx, ["id"], "The last target cannot have an ID");
      }
      if (value.searchCriteria !== null && value.searchCriteria !== undefined) {
        addIssue(ctx, ["searchCriteria"], "The last target cannot have search criteria");
      }
      if (value.selection !== null && value.selection !== undefined) {
        addIssue(ctx, ["selection"], "The last target cannot have a selection operator");
      }
    }

    if (value.target === "specific") {
      if (value.id !== null && value.id !== undefined) {
        addIssue(ctx, ["id"], "Specific targets cannot have an ID");
      }

      const hasCriteria =
        value.searchCriteria !== null &&
        value.searchCriteria !== undefined &&
        hasRealSearchCriterion(value.searchCriteria);
      if (!hasCriteria) {
        addIssue(
          ctx,
          ["searchCriteria"],
          "Specific targets require at least one search criterion",
        );
      }
    }

    if (value.action === "update") {
      if (
        value.updatePayload === null ||
        value.updatePayload === undefined ||
        !hasUpdateValue(value.updatePayload)
      ) {
        addIssue(
          ctx,
          ["updatePayload"],
          "Update actions require at least one value to change",
        );
      }
    }

    if (
      value.action === "delete" &&
      value.updatePayload !== null &&
      value.updatePayload !== undefined
    ) {
      addIssue(
        ctx,
        ["updatePayload"],
        "Delete actions cannot have an update payload",
      );
    }
  },
);

export type ModificationResult = z.infer<typeof modificationResultSchema>;
export type ModificationSearch = z.infer<typeof modificationSearchSchema>;
export type ModificationUpdatePayload = z.infer<
  typeof modificationUpdatePayloadSchema
>;

function hasRealSearchCriterion(
  searchCriteria: z.infer<typeof modificationSearchSchema>,
): boolean {
  return (
    (searchCriteria.category !== null &&
      searchCriteria.category !== undefined) ||
    (searchCriteria.amountCents !== null &&
      searchCriteria.amountCents !== undefined) ||
    (searchCriteria.keyword !== null &&
      searchCriteria.keyword !== undefined) ||
    (searchCriteria.occurredOn !== null &&
      searchCriteria.occurredOn !== undefined)
  );
}

function hasUpdateValue(
  updatePayload: z.infer<typeof modificationUpdatePayloadSchema>,
): boolean {
  return (
    (updatePayload.category !== null && updatePayload.category !== undefined) ||
    (updatePayload.amountCents !== null &&
      updatePayload.amountCents !== undefined)
  );
}

function addIssue(
  ctx: z.RefinementCtx,
  path: string[],
  message: string,
): void {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path,
    message,
  });
}

function isValidCalendarDate(value: string): boolean {
  const [yearPart, monthPart, dayPart] = value.split("-");
  const year = Number(yearPart);
  const month = Number(monthPart);
  const day = Number(dayPart);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
