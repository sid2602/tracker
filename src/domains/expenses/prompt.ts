import { EXPENSE_CATEGORIES } from "./schema.js";
import { TIME_ZONE } from "../../constants.js";

export const getExpensesPrompt = (
  text: string,
  referenceDate: string,
) => `Wyodrebnij wydatki z wiadomosci uzytkownika.
Dzisiejsza data referencyjna: ${referenceDate} (${TIME_ZONE}).
Jesli brak daty, uzyj dzisiejszej.
Obsluz wzgledne daty jak 'wczoraj' oraz daty podane w tresci.
Kwoty zapisuj w groszach jako amountCents (np. 15 PLN = 1500).
Dozwolone kategorie: ${EXPENSE_CATEGORIES.join(", ")}.
Pole note po polsku, krotki opis pozycji.
Jedna wiadomosc moze zawierac wiele pozycji w tablicy items.

Wiadomosc: ${text}`;
