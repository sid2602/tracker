import { loadConfig } from "../config.js";
import { getReferenceDate } from "../lib/dates.js";
import { parseExpenses } from "../domains/expenses/parser.js";
import { openDatabase } from "../db/connection.js";
import { getAllCategories } from "../domains/categories/repository.js";

const message = process.argv[2] ?? "zakupy 15 zl";

const config = loadConfig();
const db = openDatabase(config.databasePath);
const referenceDate = getReferenceDate();

const categories = await getAllCategories(db);
const result = await parseExpenses(config, message, referenceDate, categories);

console.log(JSON.stringify(result, null, 2));
