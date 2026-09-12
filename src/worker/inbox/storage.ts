import { sql, type Kysely, type Selectable } from "kysely";
import type { AppDatabase, InboxTable } from "../../db/schema.js";
import type { AppDeps, MessageContext } from "../types.js";

export type InboxItem = Selectable<InboxTable>;
export type InboxStatus = InboxTable["status"];

export type InboxHead = Pick<
  InboxTable,
  "message_key" | "lease_until" | "next_attempt_at" | "attempts"
>;

export async function insertInboxRecord(
  deps: AppDeps,
  context: MessageContext,
  rawEnvelope: string,
  receivedAt: number,
): Promise<void> {
  await deps.db.transaction().execute(async (trx) => {
    const nextSequence = await trx
      .selectFrom("inbox")
      .select(sql<number>`COALESCE(MAX(receive_sequence), 0) + 1`.as("next_sequence"))
      .executeTakeFirstOrThrow();

    const result = await trx
      .insertInto("inbox")
      .values({
        message_key: context.messageKey,
        receive_sequence: Number(nextSequence.next_sequence),
        raw_envelope: rawEnvelope,
        status: "pending",
        attempts: 0,
        received_at: receivedAt,
      })
      .onConflict((oc) => oc.column("message_key").doNothing())
      .execute();
    const insertedCount = result[0]?.numInsertedOrUpdatedRows;
    if (insertedCount === undefined) {
      throw new Error("Inbox insert did not report its affected row count");
    }
    const inserted = Number(insertedCount);
    if (inserted !== 0 && inserted !== 1) {
      throw new Error(
        `Inbox insert affected an unexpected number of rows: ${inserted}`,
      );
    }
  });
}

export async function selectInboxHead(
  db: Kysely<AppDatabase>,
  statuses: readonly InboxStatus[],
): Promise<InboxHead | undefined> {
  return db
    .selectFrom("inbox")
    .select(["message_key", "lease_until", "next_attempt_at", "attempts"])
    .where("status", "in", statuses)
    .orderBy("receive_sequence", "asc")
    .limit(1)
    .executeTakeFirst();
}

export async function claimInboxItem(
  db: Kysely<AppDatabase>,
  messageKey: string,
  leaseToken: string,
  leaseUntil: number,
  nowMs: number,
  maxAttempts: number,
  statuses: readonly InboxStatus[],
): Promise<boolean> {
  const claimed = await db
    .updateTable("inbox")
    .set({
      lease_token: leaseToken,
      lease_until: leaseUntil,
    })
    .where("message_key", "=", messageKey)
    .where("status", "in", statuses)
    .where("attempts", "<", maxAttempts)
    .where((eb) =>
      eb.or([
        eb("lease_until", "is", null),
        eb("lease_until", "<", nowMs),
      ]),
    )
    .where((eb) =>
      eb.or([
        eb("next_attempt_at", "is", null),
        eb("next_attempt_at", "<=", nowMs),
      ]),
    )
    .executeTakeFirst();

  return claimed.numUpdatedRows > 0n;
}

export async function selectClaimedInboxItem(
  db: Kysely<AppDatabase>,
  messageKey: string,
  leaseToken: string,
): Promise<InboxItem | undefined> {
  return db
    .selectFrom("inbox")
    .selectAll()
    .where("message_key", "=", messageKey)
    .where("lease_token", "=", leaseToken)
    .executeTakeFirst();
}
