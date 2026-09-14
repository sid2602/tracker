import type { RoutingCard } from "../../../../routing/routing-types.js";

export const trainingLogRoutingCard: RoutingCard = {
  intent: "training.log",
  object: "a completed training set, prescription, or short workout log line",
  goal: "append one or more training_entries rows",
  localRules: [
    "A short set log like \"podciąganie 8\" or \"squat 80kg x5\" is training.log even without an imperative verb.",
    "Prescriptions such as \"3x8\" / \"3×8\" are training.log; expansion into set rows happens in the domain.",
    "Questions about past training are not training.log.",
  ],
  examples: [
    "podciąganie 8",
    "przysiad 3x8 80kg",
    "EMOM 12: thruster 15",
    "bieg 40 min easy",
    "pull-ups 7",
  ],
};
