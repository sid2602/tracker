# Etapy implementacji MVP: Signal Expense Tracker

Kolejnosc wynika z zaleznosci i ryzyka. Kazda faza konczy sie sprawdzeniem
dzialajacego fragmentu, zanim powstanie nastepna.

## Zakres MVP

- Jedna rozmowa "Notatki do siebie" w Signal.
- Wiadomosci sa klasyfikowane przez LLM jako `expense`, `report` albo
  `ignore`; dotyczy to takze echa odpowiedzi bota, ktore router rozpoznaje z
  tresci jako `ignore`.
- Kategorie i identyfikatory kodowe sa po angielsku. Polski pozostaje w
  `note`, `raw_text` i odpowiedziach Signal.
- Trwaly `inbox`, lease'y i recovery sa poza MVP; to osobna Faza 1 po MVP.

## Etap 0: sprawdzenie integracji Signal

- [ ] Task: Zweryfikowac polaczone urzadzenie i odbior wiadomosci.
  - Acceptance: Sparowane urzadzenie w `MODE=json-rpc` odbiera testowa
    wiadomosc wyslana do siebie przez `GET /v1/receive/{number}?timeout=N`.
    Jest znany rzeczywisty payload z `source_author` i `source_timestamp`.
    `AUTO_RECEIVE_SCHEDULE` jest wylaczone.
  - Verify: Recznie wyslac `test 1 PLN`, odebrac payload, wyslac odpowiedz i
    sprawdzic, czy jej echo trafia do odbioru. Nie zapisywac prawdziwych danych
    finansowych ani numeru telefonu w fixture.
  - Files: Brak trwalych plikow; tymczasowy kontener i komendy.
  - Depends on: Brak.

## Etap 1: lokalny szkielet i SQLite

- [ ] Task: Utworzyc minimalny projekt TypeScript z konfiguracja.
  - Acceptance: `package.json`, TypeScript i `.env.example` definiuja tylko
    wymagane zaleznosci, `LLM_PROVIDER`, `LLM_MODEL` oraz klucze providerow.
    Brakujacy wymagany klucz zatrzymuje start z czytelnym bledem.
  - Verify: `npm run typecheck`.
  - Files: `package.json`, `tsconfig.json`, `.env.example`, `src/config.ts`.
  - Depends on: Etap 0.

- [ ] Task: Dodac lokalna baze wydatkow.
  - Acceptance: `better-sqlite3` tworzy tabele `expenses` z planowanym
    schematem, kwoty sa `INTEGER` w groszach, a zapis uzywa transakcji i
    `INSERT OR IGNORE`.
  - Verify: `npm test` obejmuje zapis, ponowny zapis pojedynczej wiadomosci i
    zachowanie kwoty w groszach.
  - Files: `src/db.ts`, `src/db.test.ts`.
  - Depends on: Konfiguracja projektu.

## Etap 2: rozpoznanie i zapis wydatku

- [ ] Task: Zaimplementowac wybor modelu oraz schematy Zod.
  - Acceptance: Jedna funkcja wybiera natywnego providera OpenAI albo
    Anthropic. Router zwraca tylko `expense`, `report` lub `ignore`; osobny
    schemat wydatku uzywa tylko kategorii `groceries`, `food`, `fuel`,
    `transport`, `home`, `bills`, `health`, `entertainment`, `other`.
    Kazde wywolanie LLM ponawia sie raz z tym samym providerem i modelem.
  - Verify: `npm test` sprawdza odrzucenie niepoprawnej intencji i wydatku
    poza schematem oraz jeden retry po niepoprawnej odpowiedzi LLM, a
    `npm run typecheck` przechodzi.
  - Files: `src/llm.ts`, `src/llm.test.ts`, `src/schemas.ts`,
    `src/schemas.test.ts`.
  - Depends on: Etap 1.

- [ ] Task: Zapisac poprawnie rozpoznany wydatek.
  - Acceptance: Handler przekazuje do LLM date i `Europe/Warsaw`, waliduje
    cala liste przed transakcja, zapisuje `note` oraz `raw_text`, a po jednym
    nieudanym retry nie wykonuje zapisu.
  - Verify: `npm test` sprawdza transakcyjny zapis wielu pozycji; recznie
    uruchomic po jednym prawdziwym przykladzie dla zakupu, paliwa i daty
    wzglednej.
  - Files: `src/expenses.ts`, `src/expenses.test.ts`.
  - Depends on: Schematy Zod.

## Etap 3: raport i worker Signal

- [ ] Task: Dodac raport oparty wylacznie na stalych zapytaniach SQLite.
  - Acceptance: Handler przyjmuje tylko zwalidowane `period` i `group_by`,
    liczy granice w `Europe/Warsaw`, uzywa parametryzowanego SQL i zawsze
    grupuje wynik po `currency`.
  - Verify: `npm test` sprawdza `this_month`, `last_month`, grupowanie
    kategorii oraz osobne sumy PLN i EUR.
  - Files: `src/report.ts`, `src/report.test.ts`.
  - Depends on: Etap 1.

- [ ] Task: Polaczyc worker z Signal.
  - Acceptance: Jeden proces long-polluje Signal, przekazuje tresc do routera,
    przez `switch` zapisuje wydatek albo wysyla raport, a `ignore` nie robi
    nic. Echo potwierdzenia lub raportu trafia do routera i konczy jako
    `ignore`, bez filtra prefiksow. Po nieudanej walidacji routera albo
    handlera, po jednym retry, worker nie wykonuje akcji i odpisuje, ze
    wiadomosc nie zostala rozpoznana; nie traktuje tego jako `ignore`.
  - Verify: Recznie wyslac kolejno wydatek, komende raportu i losowa notatke;
    potwierdzic jeden zapis, raport z poprawna suma oraz brak odpowiedzi dla
    notatki i echa odpowiedzi bota. Zasymulowac odpowiedz LLM niezgodna ze
    schematem i potwierdzic brak zapisu oraz odpowiedz o nierozpoznanej
    wiadomosci.
  - Files: `src/signal.ts`, `src/worker.ts`.
  - Depends on: Etap 0, Etap 2 i raport.

## Etap 4: wdrozenie i obserwowalnosc

- [ ] Task: Spakowac dwa kontenery dla Raspberry Pi.
  - Acceptance: Docker Compose uruchamia tylko `signal-cli-rest-api` i
    worker, oba z `restart: unless-stopped` oraz wolumenami Signal i SQLite.
    Nie publikuje portow; QR jest dostepny tylko tymczasowo przez
    `127.0.0.1`.
  - Verify: `docker compose up -d`, restart obu kontenerow i ponowne
    przetworzenie testowego wydatku bez ponownego zapisu pojedynczej pozycji.
  - Files: `Dockerfile`, `docker-compose.yml`, `.dockerignore`.
  - Depends on: Etap 3.

- [ ] Task: Dodac opcjonalny tracing Langfuse.
  - Acceptance: Kazda wiadomosc ma jeden trace z metadanymi LLM i wynikiem,
    bez tresci Signal, promptu, `note` ani `raw_text`. Brak kluczy wylacza
    tracing, a jego blad robi tylko `console.warn`.
  - Verify: Uruchomic workera bez kluczy oraz z kluczami Langfuse; w obu
    wariantach zapis wydatku i odpowiedz Signal dzialaja.
  - Files: `src/tracing.ts`, `src/worker.ts`, `.env.example`.
  - Depends on: Worker Signal.

## Gotowe MVP

MVP jest gotowe po Etapie 4, gdy po restarcie kontenerow jedna testowa
wiadomosc o wydatku zapisuje sie raz, raport pokazuje poprawne sumy per waluta,
a nieobslugiwane tresci i echo odpowiedzi bota koncza jako `ignore`.

Nie dodawaj przed tym durable inboxa, CSV, glosu, panelu WWW ani self-hosted
Langfuse. Wroc do nich dopiero po potwierdzeniu, ze MVP jest uzywane.

