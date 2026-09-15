import { z } from "zod";

export const MAX_CATEGORY_NAME_LENGTH = 100;
export const MAX_CATEGORY_DESCRIPTION_LENGTH = 500;

const categoryNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_CATEGORY_NAME_LENGTH)
  .refine(hasNoControlCharacters, "Category name contains control characters");

const descriptionSchema = z
  .string()
  .max(MAX_CATEGORY_DESCRIPTION_LENGTH)
  .refine(
    hasNoControlCharacters,
    "Category description contains control characters",
  );

const categoryActionBaseSchema = z.object({
  action: z.enum(["add", "remove", "list"]),
  categoryName: categoryNameSchema
    .nullable()
    .describe("Required for 'add' or 'remove' actions. Should be lowercase."),
  description: descriptionSchema
    .nullable()
    .optional()
    .describe("Optional context or examples provided by user for this category."),
});

export const categoryActionSchema = categoryActionBaseSchema.superRefine(
  (value, ctx) => {
    if (
      (value.action === "add" || value.action === "remove") &&
      value.categoryName === null
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["categoryName"],
        message: `${value.action} actions require a category name`,
      });
    }
    if (value.action === "list" && value.categoryName !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["categoryName"],
        message: "List actions cannot target a category",
      });
    }
    if (
      value.action !== "add" &&
      value.description !== null &&
      value.description !== undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["description"],
        message: `${value.action} actions cannot have a description`,
      });
    }
  },
);

function hasNoControlCharacters(value: string): boolean {
  return !/[\u0000-\u001f\u007f]/u.test(value);
}

export type CategoryAction = z.output<typeof categoryActionSchema>;
