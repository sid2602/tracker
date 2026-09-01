export const getRouterPrompt = (text: string) => `Sklasyfikuj wiadomosc uzytkownika z notatki Signal.
Zwroc intent:
- expense: zapis wydatku (np. zakupy, paliwo, rachunek)
- report: prosba o raport wydatkow (np. raport z tego miesiaca)
- ignore: inna notatka bez akcji

Dla report podaj period (this_month | last_month) i group_by (total | category).

Wiadomosc: ${text}`;
