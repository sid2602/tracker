import type { RoutingCard } from "../../../../routing/routing-types.js";

export const trainingModificationRoutingCard: RoutingCard = {
  intent: "training.modification",
  object: "an existing training set or entry",
  goal: "correct, update, or delete a previously logged training entry",
  localRules: [
    "Short set corrections like \"3 seria 7\", \"ostatnia 7\", or \"last set 7\" are training.modification, not training.log.",
    "Undo/delete/edit requests about prior training entries are training.modification.",
    "New set logs and NxR prescriptions remain training.log.",
  ],
  examples: [
    "3 seria 7",
    "ostatnia 7",
    "last set 7",
    "usuń ostatni wpis treningowy",
    "delete training entry #12",
  ],
};
