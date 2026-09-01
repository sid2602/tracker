import { loadConfig } from "../config.js";
import { getReferenceDate } from "../lib/dates.js";
import { parseExpenses } from "../domains/expenses/parser.js";

const message = process.argv[2] ?? "zakupy 15 zl";

const config = loadConfig();
const referenceDate = getReferenceDate();

const result = await parseExpenses(config, message, referenceDate);

console.log(JSON.stringify(result, null, 2));
