# Plan MVP: Signal Expense Tracker

## Cel

Wysylasz do siebie w Signal wiadomosc, np. `zakupy 15 zl`, `stacja benzynowa
15 zl` albo `zrob raport wydatkow z tego miesiaca`. Aplikacja rozpoznaje typ
notatki, zapisuje wydatek lub odpisuje raportem. Losowe notatki ignoruje.

## Minimalna architektura

```text
Signal "Notatki do siebie"
  -> signal-cli-rest-api (linked device, MODE=json-rpc)
  -> worker Node.js + TypeScript (long-poll /v1/receive)
  -> AI SDK router: expense | report | ignore
  -> switch:
       expense -> AI SDK wydatkow -> Zod -> SQLite -> Signal: "✅ Zapisano"
       report  -> stale SQL -> Signal: "📊 Raport"
       ignore  -> brak akcji

Worker --asynchronicznie--> Langfuse Cloud (trace LLM)
```

Docker Compose uruchamia tylko dwa kontenery:

1. `signal-cli-rest-api` jako sparowane urzadzenie Signal.
2. Worker Node.js z logika aplikacji.

Kontenery maja `restart: unless-stopped` i trwale wolumeny na konfiguracje
Signal oraz plik SQLite. Nie wystawiaj portow publicznie. Do pierwszego
sparowania QR wystarczy tymczasowe zbindowanie API do `127.0.0.1` i tunel SSH.
Langfuse Cloud nie jest kolejnym kontenerem na Raspberry Pi.

## Signal

`signal-cli-rest-api` nie ma potwierdzonego webhooka dla tego przeplywu.
Worker wykonuje long-polling:

```text
GET /v1/receive/{numer}?timeout=N
```

Ustaw `MODE=json-rpc`, aby `signal-cli` dzialal jako daemon. Nie ustawiaj
`AUTO_RECEIVE_SCHEDULE`, poniewaz drugi odbior moze przejac wiadomosci przed
workerem.

Kazda odpowiedz bota zaczyna sie od `✅`. Worker ignoruje taki tekst przed
wywolaniem LLM, wiec ewentualne echo wlasnego potwierdzenia nie tworzy petli.

## Aplikacja TypeScript

Bez Expressa, Fastify, n8n i dodatkowego serwera HTTP. Wystarczy jeden proces:

1. Odbiera wiadomosc z Signal.
2. Ignoruje techniczne potwierdzenia.
3. Pyta router LLM tylko o typ notatki: `expense`, `report` albo `ignore`.
4. Przekazuje cala wiadomosc do handlera wybranego przez `switch`.
5. Handler `expense` wywoluje szczegolowy LLM, waliduje Zod i zapisuje
   pozycje w jednej transakcji SQLite.
6. Handler `report` wykonuje stale, parametryzowane zapytanie SQLite i wysyla
   wynik do Signal.
7. Handler `ignore` konczy bez akcji i odpowiedzi.
8. Asynchronicznie zapisuje trace LLM w Langfuse.

Kazde wywolanie LLM ma jeden retry z tym samym providerem i modelem. Jezeli
router lub handler wydatku nadal nie zwroci poprawnych danych, nie wykonuj
akcji i odpisz, ze wiadomosc nie zostala rozpoznana. Nie zmieniaj automatycznie
GPT na Claude ani odwrotnie.

## Intencje i dispatch

Router ma maly, zamkniety schemat Zod:

```text
expense | report | ignore
```

Router nie przypisuje kategorii ani nie wykonuje SQL. Tylko handler `expense`
dostaje liste kategorii, date i szczegolowy schemat wydatku. Pozwala to dodac
pozniej niezalezny typ notatki bez powiekszania promptu od wydatkow.

Handler `report` przyjmuje tylko zwalidowane parametry, np.
`period: this_month | last_month` i `group_by: total | category`. Sam liczy
granice dat w `Europe/Warsaw` i wykonuje znane zapytanie SQLite. LLM nigdy nie
zwraca SQL, nazwy kolumn ani dowolnego filtra.

`ignore` jest poprawna, jawna decyzja routera dla notatki bez obslugiwanej
akcji. Nie traktuj bledu Zod jako `ignore`.

## Model danych

Uzyj `better-sqlite3`. Kwoty trzymaj w groszach jako `INTEGER`, nie jako
`REAL`. Walute trzymaj jako trzyliterowy kod ISO 4217. Raport zawsze grupuje
sumy po `currency`; nie dodawaj razem kwot roznych walut.

```sql
CREATE TABLE expenses (
  id INTEGER PRIMARY KEY,
  source_author TEXT NOT NULL,
  source_timestamp INTEGER NOT NULL,
  item_index INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'PLN',
  category TEXT NOT NULL,
  occurred_on TEXT NOT NULL,
  note TEXT NOT NULL,
  raw_text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (source_author, source_timestamp, item_index)
);
```

Wstawiaj rekordy przez `INSERT OR IGNORE`. Klucz unikatowy w pelni chroni
pojedynczy wydatek przed podwojnym zapisem po restarcie lub ponownej dostawie,
a `item_index` pozwala zapisac kilka wydatkow z jednej wiadomosci. Dla
wielopozycyjnej wiadomosci ponowne parsowanie moze zmienic liczbe lub kolejnosc
pozycji; pelna gwarancja dla tego przypadku przychodzi z zamrozonym
`parsed_json` w Fazie 1.

Najpierw pobierz i zwaliduj cala liste wydatkow, a dopiero potem otworz
transakcje zapisu.

## Kategorie i daty

Na start trzymaj w kodzie mala, zamknieta liste angielskich identyfikatorow.
Tylko `note` i `raw_text` moga zachowac polska tresc:

```text
groceries, food, fuel, transport, home, bills,
health, entertainment, other
```

Do szczegolowego promptu wydatkow przekazuj biezaca date i strefe
`Europe/Warsaw`. Brak daty oznacza dzisiaj; obsluguj np. `wczoraj` i date
podana w tresci.

## Wymienny LLM

Uzyj Vercel AI SDK z natywnymi providerami:

```text
ai
@ai-sdk/openai
@ai-sdk/anthropic
```

Jedna funkcja wybiera provider na podstawie konfiguracji. Router i handler
wydatkow maja osobne, male schematy Zod dla `generateObject`, ale uzywaja tej
samej konfiguracji modelu:

```text
LLM_PROVIDER=openai | anthropic
LLM_MODEL
OPENAI_API_KEY
ANTHROPIC_API_KEY
```

Pozwala to recznie zmienic GPT na Claude bez zmiany logiki aplikacji. Kazdy
wynik routera albo handlera musi przejsc walidacje Zod przed wykonaniem akcji.

Zmiana modelu nie moze zagwarantowac identycznej jakosci rozumienia tekstu.
Przed zmiana uruchom kilka prawdziwych przykladow
`wiadomosc -> oczekiwany JSON`; to wystarczy jako maly test regresji, bez
budowania frameworka ewaluacyjnego.

## Langfuse

Langfuse sluzy w MVP tylko do obserwowalnosci LLM: czasu odpowiedzi, modelu,
liczby tokenow i wyniku parsowania. Kazda wiadomosc Signal tworzy jeden trace:
router jest pierwsza generacja, a handler wydatku opcjonalna druga generacja.
Zapisuj:

```text
model, provider, czas odpowiedzi, tokeny, wynik walidacji,
liczbe zapisanych wydatkow i kod bledu
```

Domyslnie nie wysylaj do Langfuse tresci wiadomosci, promptu ani opisu
wydatku. To dane finansowe; metadane wystarcza do wykrycia wolnego, drogiego
lub zawodnego modelu. Pelne tresci wlaczaj tylko swiadomie podczas diagnostyki.

Dodaj do workera aktualny SDK JS/TS Langfuse:

```text
@langfuse/tracing
@langfuse/otel
@opentelemetry/sdk-node
```

Konfiguracja wymaga tylko:

```text
LANGFUSE_PUBLIC_KEY
LANGFUSE_SECRET_KEY
LANGFUSE_BASE_URL=https://cloud.langfuse.com
```

Brak kluczy wylacza tracing; zapis wydatku nie moze od nich zalezec. SDK
eksportuje trace asynchronicznie, wiec awaria Langfuse nie blokuje Signal,
LLM ani SQLite. Taki blad zapisuj jako `console.warn`, nie ukrywaj go pustym
`catch`.

Nie uzywaj teraz Langfuse do dynamicznego zarzadzania promptami, datasetow ani
automatycznych evaluatorow. Prompt zostaje wersjonowany razem z kodem, a kilka
przykladow regresji pozostaje wystarczajacym sprawdzeniem przed zmiana modelu.

Zrodla: [AI SDK providers](https://ai-sdk.dev/docs/foundations/providers-and-models),
[Langfuse JS/TS SDK v5](https://langfuse.com/docs/observability/sdk/overview),
[Langfuse self-hosting v4](https://langfuse.com/self-hosting) i
[Anthropic OpenAI SDK compatibility](https://platform.claude.com/docs/en/cli-sdks-libraries/libraries/openai-sdk).

## Raspberry Pi i prywatnosc

Raspberry Pi 4 lub 5 z co najmniej 2 GB RAM obsluzy ten wariant, gdy model
dziala przez API. Nie uruchamiaj lokalnego modelu na tym samym Pi w MVP:
bedzie wolniejszy i zwykle mniej dokladny.

Signal szyfruje transport, ale zewnetrzny dostawca LLM otrzyma tresc wydatku.
Wybierz lokalny model tylko wtedy, gdy ta cena prywatnosci jest wazniejsza od
jakosci rozpoznawania. Langfuse Cloud dostaje domyslnie tylko metadane trace,
nie tekst wiadomosci ani odpowiedz LLM.

## Faza 1 po MVP: niezawodne przetwarzanie

Cel: po trwalym odebraniu komendy przez aplikacje ma ona zostac przetworzona az
do sukcesu technicznego, bez podwojnego zapisu wydatku po crashu, restarcie lub
ponownej dostawie z Signal.

Nie da sie zagwarantowac doslownie "exactly once" od telefonu do Signal, LLM i
SQLite. `signal-cli-rest-api` nie dokumentuje ACK/NACK ani redelivery dla
`/v1/receive`. Po udanym zapisie do lokalnego inboxa da sie jednak osiagnac
at-least-once przetwarzanie oraz effectively-once zapis wydatku.

### Durable inbox

Dodaj tabele `inbox`. Natychmiast po odebraniu eventu Signal zapisz surowy
payload do SQLite, zanim uruchomisz LLM, parsowanie lub wysylke odpowiedzi.

```text
message_key UNIQUE
raw_envelope
status: pending | analyzed | saved | confirmed | ignored
parsed_json
response_text
attempts
next_attempt_at
lease_until
lease_token
received_at
```

`message_key` buduj z niezmiennych pol eventu Signal, sprawdzonych na zywych
payloadach, np. konto + nadawca + urzadzenie nadawcy + timestamp. Nie deduplikuj
po tresci: dwa identyczne zakupy moga byc prawidlowe.

Istniejacy klucz `UNIQUE(source_author, source_timestamp, item_index)` w
`expenses` zostaje zabezpieczeniem przed podwojnym zapisem jednej pozycji.

### Przeplyw i transakcje

1. Odbior Signal zapisuje event jako `pending` przez `INSERT OR IGNORE`.
2. Worker atomowo przejmuje gotowy wpis lease'em i wywoluje router.
3. `ignore` ustawia stan `ignored`; `expense` wywoluje szczegolowy LLM, a
   `report` przygotowuje parametry raportu.
4. Po poprawnej walidacji Zod zapisuje koncowy `parsed_json` i status
   `analyzed`. Blad merytoryczny zapisuje w `parsed_json`
   `{"outcome":"needs_attention","reason":"..."}`, zapisuje prosbe o
   poprawienie wiadomosci w `response_text` i ustawia status `saved`, bez
   wykonania niejednoznacznej akcji.
5. Osobna transakcja zapisuje wydatki albo wynik raportu w `response_text` i
   ustawia status `saved`.
6. Dla `saved` worker wysyla zapisana odpowiedz Signal i ustawia `confirmed`.

Zapis `parsed_json` zamraza zwalidowana decyzje LLM. Crash po udanej analizie
nie wywola modelu ponownie i nie zmieni wyniku, nawet jezeli pozniej zmienisz
GPT na Claude. `response_text` zapewnia, ze retry potwierdzenia raportu nie
policzy go ponownie na zmienionych danych.

Status `saved` jest lekkim transactional outboxem: w tej samej transakcji co
wykonana akcja zapisana jest intencja wyslania jednej odpowiedzi. Osobna tabela
`outbox` nie jest potrzebna, dopoki jedynym efektem ubocznym jest odpowiedz w
tym samym czacie Signal.

### Retry i recovery

Uruchom `recoverDue()` przy starcie oraz timerem co 30 sekund. Nie uruchamiaj
recovery tylko przed long-pollem, bo subskrypcja Signal moze czekac bez konca
na kolejna wiadomosc.

Blad techniczny, np. timeout, brak sieci, 429, 5xx lub chwilowa blokada SQLite,
zostawia wpis do ponowienia. Zwielksz `attempts`, ustaw `next_attempt_at` z
wykladniczym backoffem ograniczonym do maksymalnego odstepu i probuj dalej bez
limitu prob.

Blad merytoryczny po jednym retry tego samego modelu nie wykonuje
niejednoznacznej akcji automatycznie. Zapisana odpowiedz przechodzi przez
`saved -> confirmed` tak jak kazda inna odpowiedz Signal.

### Lease i stale writers

Przed praca nad wierszem worker atomowo ustawia `lease_until` oraz losowy
`lease_token` przez natywne `crypto.randomUUID()`. Kazda pozniejsza zmiana
statusu musi warunkowac zapis tym samym tokenem.

```text
UPDATE inbox ... WHERE id = ? AND lease_token = ?
```

Po wygasnieciu lease recovery przejmie wpis. Token blokuje spoznione wywolanie
LLM przed nadpisaniem wyniku nowszego retry. Ustaw timeout LLM krotszy niz
lease, np. timeout 30 s i lease 120 s.

### Granice gwarancji

- Wiadomosc zapisana w `inbox` bedzie ponawiana po kazdej awarii technicznej az
  do przetworzenia.
- Zapis wydatkow jest effectively-once: transakcja SQLite i unikatowy klucz
  chronia przed duplikatem.
- Potwierdzenie Signal jest at-least-once: crash po udanej wysylce, a przed
  ustawieniem `confirmed`, moze wyslac drugie, nieszkodliwe potwierdzenie.
- Crash pomiedzy eventem z Signal a pierwszym commitem `inbox` pozostaje luka,
  ktorej nie da sie formalnie zamknac bez udokumentowanego ACK po stronie
  Signal. Durable inbox minimalizuje ja do jednego krotkiego zapisu.

### Trwalosc Raspberry Pi

Przenies wolumen SQLite na USB SSD, nie trzymaj jedynej kopii na karcie SD.
Uzyj transakcji SQLite, `journal_mode=WAL` i `synchronous=FULL`. Dodaj UPS oraz
szyfrowany backup na drugi nosnik lub przez `rclone`; backup wykonuj przez
mechanizm backupu SQLite, nie przez zwykle kopiowanie aktywnego pliku `.db`.

## Dalsze rozszerzenia

W Fazie 1 zapisuj tez jawne decyzje `ignore` w `inbox`, aby moc sprawdzic, czy
router systematycznie nie ignoruje prawdziwych wydatkow. Potem dodaj eksport
CSV, obsluge glosu lub panel WWW, gdy beda potrzebne. Samodzielny Langfuse
rozwaz dopiero na osobnej maszynie:
wymaga Web, Worker, PostgreSQL, Redis/Valkey, ClickHouse i storage S3, wiec nie
jest minimalnym dodatkiem do tego Raspberry Pi.

Nie dodawaj teraz Python/FastAPI, n8n, Google Sheets, osobnego numeru Signal,
Whisper, panelu do zarzadzania kategoriami ani self-hosted Langfuse na tym samym
Raspberry Pi. Nie dodawaj tez OpenRouter, LiteLLM, wlasnych adapterow providerow
ani Anthropic przez OpenAI-compatibility.

