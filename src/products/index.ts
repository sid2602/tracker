import { expensesProduct } from "./expenses/index.js";
import { trainingProduct } from "./training/index.js";
import { buildProductRegistry } from "./registry.js";

export const productRegistry = buildProductRegistry([
  expensesProduct,
  trainingProduct,
]);
