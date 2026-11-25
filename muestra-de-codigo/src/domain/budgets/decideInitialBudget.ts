import type { RejectionReason } from "../settings/types";
import type { Budget, BudgetDecision, BudgetDecisionInput } from "./types";
import { isBudgetExpired } from "./budgetExpiry";
import { BudgetExpiredError, BudgetNotDecidableError, DecisionConflictError } from "./errors";
import { assertRejectionReasonSent, rejectionReasonIdOf, resolveRejectionReason } from "./rejectionReason";

export interface WorkOrderRef {
  id: string;
  number: string;
}

export type DecisionOutcome =
  | { kind: "replayed"; decision: BudgetDecision; workOrder: WorkOrderRef | null }
  | { kind: "recorded"; decision: BudgetDecision; budget: Budget; createsWorkOrder: boolean };

const decidableStatuses = new Set(["issued", "pending_response"]);

/** Trims an optional note, treating a blank string the same as a missing one. */
function normalizeNotes(notes: string | undefined): string | undefined {
  const trimmed = notes?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Whether two decision inputs represent the same client decision: same result, same instant (compared
 * by `Date.parse`, so a different UTC offset for the same instant still matches), same channel, same
 * trimmed confirming person, same notes once blank notes are treated as missing and, for a rejection, same reason
 * (an acceptance has none: a reason sent with it is ignored).
 */
export function sameDecision(a: BudgetDecisionInput, b: BudgetDecisionInput): boolean {
  return (
    a.result === b.result &&
    Date.parse(a.decidedAt) === Date.parse(b.decidedAt) &&
    a.channel === b.channel &&
    a.confirmedByPerson.trim() === b.confirmedByPerson.trim() &&
    normalizeNotes(a.notes) === normalizeNotes(b.notes) &&
    rejectionReasonIdOf(a) === rejectionReasonIdOf(b)
  );
}

/**
 * Pure decision rule for an initial budget, mirroring the `record_initial_budget_decision` RPC
 * (`20260811000002_security_and_decision_rpc`) so the demo and Supabase modes behave the same:
 * - a rejection without a reason is refused first, before any state check or replay (the database asks for it right after the person);
 * - a budget that is not `initial` cannot be decided;
 * - a decision that already exists is replayed when it matches the new input, otherwise it conflicts;
 * - an expired budget cannot be decided; a recorded decision still replays;
 * - a budget outside `issued`/`pending_response` cannot be decided;
 * - a rejection must send an active reason of `rejectionReasons`, like the database (an inactive or unknown one is checked
 *   after the replay, so a recorded rejection replays even if its reason was deactivated since);
 * - otherwise the decision is recorded, and a work order is created only for an acceptance.
 */
export function decideInitialBudget(
  state: { budget: Budget; decision: BudgetDecision | null; workOrder: WorkOrderRef | null },
  input: BudgetDecisionInput,
  decisionId: string,
  today: string,
  rejectionReasons: readonly RejectionReason[] = [],
): DecisionOutcome {
  const { budget, decision, workOrder } = state;
  assertRejectionReasonSent(input);
  if (budget.kind !== "initial") throw new BudgetNotDecidableError();
  if (decision) {
    if (sameDecision(decision, input)) return { kind: "replayed", decision, workOrder };
    throw new DecisionConflictError();
  }
  if (isBudgetExpired(budget.status, budget.validUntil, today)) throw new BudgetExpiredError("initial");
  if (!decidableStatuses.has(budget.status)) throw new BudgetNotDecidableError();
  const { rejectionReasonId: _sentReasonId, ...decisionInput } = input;
  const rejectionReasonId = rejectionReasonIdOf(input);
  // Throws for a rejection without an active reason, before anything is recorded.
  const rejectionReasonLabel = resolveRejectionReason(input, rejectionReasons) ?? undefined;
  const recordedDecision: BudgetDecision = {
    ...decisionInput,
    notes: normalizeNotes(input.notes),
    id: decisionId,
    budgetId: budget.id,
    // Only a rejection carries a reason.
    ...(rejectionReasonId === undefined ? {} : { rejectionReasonId, rejectionReasonLabel }),
  };
  const createsWorkOrder = input.result === "accepted";
  const updatedBudget: Budget = { ...budget, status: input.result };
  return { kind: "recorded", decision: recordedDecision, budget: updatedBudget, createsWorkOrder };
}
