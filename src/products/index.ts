import { expensesProduct } from "./expenses/index.js";
import { buildProductRegistry } from "./registry.js";

export const productRegistry = buildProductRegistry([expensesProduct]);
