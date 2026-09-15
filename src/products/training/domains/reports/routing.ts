import type { RoutingCard } from "../../../../routing/routing-types.js";

export const trainingReportRoutingCard: RoutingCard = {
  intent: "training.report",
  object: "recorded training entries from a past or current period",
  goal: "list or summarize stored training sets",
  localRules: [
    "Questions about what was trained, how many sets/reps, or EMOM/cardio history are training.report.",
    "A missing date is allowed; the domain may default to today or the current month.",
  ],
  examples: [
    "co robiłem na treningu wczoraj?",
    "show my training today",
    "ile podciągnięć w tym tygodniu?",
    "training report this month",
    "pokaż serie z dziś",
  ],
};
