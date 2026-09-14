import type { ModificationResult } from "../schema.js";

export function isActionConsistent(
  text: string,
  action: ModificationResult["action"],
): boolean {
  const deleteCommand =
    /^(?:please\s+)?(?:undo|delete|remove|cancel|cofnij|anuluj|usuń|usun|skasuj)(?=$|[^\p{L}])/u.test(
      text,
    );
  const updateCommand =
    /^(?:please\s+)?(?:change|update|edit|modify|zmień|zmien|edytuj)(?=$|[^\p{L}])/u.test(
      text,
    );

  return !(
    deleteCommand === updateCommand ||
    (deleteCommand && action !== "delete") ||
    (updateCommand && action !== "update")
  );
}
