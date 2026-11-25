import { describe, expect, it } from "vitest";
import { budgetForTest } from "./testBudgets";
import type { Budget, BudgetDecision, BudgetDecisionInput } from "./types";
import { BudgetExpiredError, BudgetNotDecidableError, DecisionConflictError } from "./errors";
import { decideInitialBudget, sameDecision, type WorkOrderRef } from "./decideInitialBudget";
import type { RejectionReason } from "../settings/types";

const baseBudget: Budget = {
  id: "bud-00045-v1",
  number: "PR-00045",
  kind: "initial",
  version: 1,
  clientId: "cli-001",
  engineId: "eng-001",
  workOrderId: null,
  status: "pending_response",
  issuedAt: "2026-05-22T10:00:00-03:00",
  validUntil: "2026-05-29T23:59:59-03:00",
  lines: [],
  subtotal: "0",
  netSubtotal: "0",
  taxTotal: "0",
  discountTotal: "0",
  surchargeTotal: "0",
  total: "0",
  taxRate: "0.21",
  discount: { categoryName: null, categoryRate: null, rate: "0", reason: null },
  surcharge: { rate: "0", reason: null },
};

const acceptance: BudgetDecisionInput = {
  result: "accepted",
  decidedAt: "2026-05-22T11:00:00-03:00",
  channel: "whatsapp",
  confirmedByPerson: "Martín López",
  notes: "El cliente acepta el presupuesto y autoriza el ingreso del trabajo.",
};

const rejection: BudgetDecisionInput = {
  result: "rejected",
  decidedAt: "2026-05-22T11:00:00-03:00",
  channel: "email",
  confirmedByPerson: "Martín López",
};

const activeReasons: readonly RejectionReason[] = [{ id: "precio-elevado", label: "Precio elevado", active: true }];

const decisionId = "decision-00045";

describe("sameDecision", () => {
  it("treats the same instant written with a different offset as the same decision", () => {
    expect(sameDecision(acceptance, { ...acceptance, decidedAt: "2026-05-22T14:00:00Z" })).toBe(true);
  });

  it("treats blank notes as missing notes", () => {
    expect(sameDecision({ ...acceptance, notes: "  " }, { ...acceptance, notes: undefined })).toBe(true);
  });

  it("treats untrimmed person names as equal once trimmed", () => {
    expect(sameDecision(acceptance, { ...acceptance, confirmedByPerson: "  Martín López  " })).toBe(true);
  });

  it("is false when the result differs", () => {
    expect(sameDecision(acceptance, rejection)).toBe(false);
  });

  it("is false when the channel differs", () => {
    expect(sameDecision(acceptance, { ...acceptance, channel: "email" })).toBe(false);
  });

  it("is false when the confirming person differs", () => {
    expect(sameDecision(acceptance, { ...acceptance, confirmedByPerson: "Otra Persona" })).toBe(false);
  });

  it("is false when the notes differ", () => {
    expect(sameDecision(acceptance, { ...acceptance, notes: "Otra observación." })).toBe(false);
  });
});

describe("decideInitialBudget", () => {
  it("throws BudgetNotDecidableError when the budget is not of kind initial", () => {
    const revision: Budget = { ...baseBudget, kind: "revision" };
    expect(() => decideInitialBudget({ budget: revision, decision: null, workOrder: null }, acceptance, decisionId, "2026-05-22")).toThrow(
      BudgetNotDecidableError,
    );
  });

  it("throws BudgetNotDecidableError when the budget is a draft", () => {
    const draft: Budget = { ...baseBudget, status: "draft" };
    expect(() => decideInitialBudget({ budget: draft, decision: null, workOrder: null }, acceptance, decisionId, "2026-05-22")).toThrow(
      BudgetNotDecidableError,
    );
  });

  it("throws BudgetNotDecidableError when the budget already has a terminal status", () => {
    const accepted: Budget = { ...baseBudget, status: "accepted" };
    expect(() => decideInitialBudget({ budget: accepted, decision: null, workOrder: null }, acceptance, decisionId, "2026-05-22")).toThrow(
      BudgetNotDecidableError,
    );
  });

  it("accepts an issued budget as decidable", () => {
    const issued: Budget = { ...baseBudget, status: "issued" };
    const outcome = decideInitialBudget({ budget: issued, decision: null, workOrder: null }, acceptance, decisionId, "2026-05-22");
    expect(outcome.kind).toBe("recorded");
  });

  it("records an acceptance and marks that it creates a work order", () => {
    const outcome = decideInitialBudget({ budget: baseBudget, decision: null, workOrder: null }, acceptance, decisionId, "2026-05-22");
    expect(outcome).toMatchObject({ kind: "recorded", createsWorkOrder: true });
    if (outcome.kind !== "recorded") throw new Error("expected a recorded outcome");
    expect(outcome.decision).toMatchObject({ id: decisionId, budgetId: baseBudget.id, result: "accepted" });
    expect(outcome.budget.status).toBe("accepted");
  });

  it("records a rejection and marks that it does not create a work order", () => {
    const outcome = decideInitialBudget({ budget: baseBudget, decision: null, workOrder: null }, { ...rejection, rejectionReasonId: "precio-elevado" }, decisionId, "2026-05-22", activeReasons);
    expect(outcome).toMatchObject({ kind: "recorded", createsWorkOrder: false });
    if (outcome.kind !== "recorded") throw new Error("expected a recorded outcome");
    expect(outcome.budget.status).toBe("rejected");
  });

  it("replays the same acceptance idempotently, returning the existing work order", () => {
    const existingDecision: BudgetDecision = { ...acceptance, id: decisionId, budgetId: baseBudget.id };
    const existingWorkOrder: WorkOrderRef = { id: "wo-00124", number: "OT-00124" };
    const accepted: Budget = { ...baseBudget, status: "accepted", workOrderId: existingWorkOrder.id };
    const outcome = decideInitialBudget(
      { budget: accepted, decision: existingDecision, workOrder: existingWorkOrder },
      acceptance,
      decisionId,
      "2026-05-22",
    );
    expect(outcome).toEqual({ kind: "replayed", decision: existingDecision, workOrder: existingWorkOrder });
  });

  it("replays the same instant even when written with a different offset", () => {
    const existingDecision: BudgetDecision = { ...acceptance, id: decisionId, budgetId: baseBudget.id };
    const accepted: Budget = { ...baseBudget, status: "accepted", workOrderId: "wo-00124" };
    const outcome = decideInitialBudget(
      { budget: accepted, decision: existingDecision, workOrder: { id: "wo-00124", number: "OT-00124" } },
      { ...acceptance, decidedAt: "2026-05-22T14:00:00Z" },
      decisionId,
      "2026-05-22",
    );
    expect(outcome.kind).toBe("replayed");
  });

  it("replays a rejection with no work order", () => {
    const existingDecision: BudgetDecision = { ...rejection, id: decisionId, budgetId: baseBudget.id, rejectionReasonId: "precio-elevado", rejectionReasonLabel: "Precio elevado" };
    const rejected: Budget = { ...baseBudget, status: "rejected" };
    const outcome = decideInitialBudget(
      { budget: rejected, decision: existingDecision, workOrder: null },
      { ...rejection, rejectionReasonId: "precio-elevado" },
      decisionId,
      "2026-05-22",
    );
    expect(outcome).toEqual({ kind: "replayed", decision: existingDecision, workOrder: null });
  });

  it("throws DecisionConflictError when accepting after an existing rejection", () => {
    const existingDecision: BudgetDecision = { ...rejection, id: decisionId, budgetId: baseBudget.id };
    const rejected: Budget = { ...baseBudget, status: "rejected" };
    expect(() =>
      decideInitialBudget({ budget: rejected, decision: existingDecision, workOrder: null }, acceptance, decisionId, "2026-05-22"),
    ).toThrow(DecisionConflictError);
  });

  it("throws DecisionConflictError when a different input is sent for an already decided budget", () => {
    const existingDecision: BudgetDecision = { ...acceptance, id: decisionId, budgetId: baseBudget.id };
    const accepted: Budget = { ...baseBudget, status: "accepted", workOrderId: "wo-00124" };
    expect(() =>
      decideInitialBudget(
        { budget: accepted, decision: existingDecision, workOrder: { id: "wo-00124", number: "OT-00124" } },
        { ...acceptance, confirmedByPerson: "Otra Persona" },
        decisionId,
        "2026-05-22",
      ),
    ).toThrow(DecisionConflictError);
  });
});

const expiringBudget = budgetForTest();
const lateAcceptance = {
  result: "accepted" as const, decidedAt: "2026-05-30T10:00:00-03:00", channel: "phone" as const, confirmedByPerson: "Persona",
};

describe("decideInitialBudget and expiry", () => {
  it("records a decision on the last day of validity", () => {
    const outcome = decideInitialBudget({ budget: expiringBudget, decision: null, workOrder: null }, lateAcceptance, "d-1", "2026-05-29");
    expect(outcome.kind).toBe("recorded");
  });

  it("refuses a decision the day after the validity", () => {
    expect(() => decideInitialBudget({ budget: expiringBudget, decision: null, workOrder: null }, lateAcceptance, "d-1", "2026-05-30"))
      .toThrow(BudgetExpiredError);
  });

  it("replays a decision that was recorded before the budget expired", () => {
    const decision = { ...lateAcceptance, id: "d-1", budgetId: expiringBudget.id };
    const outcome = decideInitialBudget(
      { budget: { ...expiringBudget, status: "accepted" }, decision, workOrder: { id: "wo-1", number: "OT-00001" } },
      lateAcceptance, "d-1", "2026-06-30",
    );
    expect(outcome.kind).toBe("replayed");
  });
});

describe("sameDecision and the rejection reason", () => {
  const withReason = { ...rejection, rejectionReasonId: "demora" };

  it("compares the reason of a rejection", () => {
    expect(sameDecision(withReason, { ...withReason })).toBe(true);
    expect(sameDecision(withReason, { ...withReason, rejectionReasonId: " demora " })).toBe(true);
    expect(sameDecision(withReason, { ...withReason, rejectionReasonId: "otro" })).toBe(false);
    expect(sameDecision(withReason, rejection)).toBe(false);
    expect(sameDecision(rejection, withReason)).toBe(false);
  });

  it("treats a blank reason as a missing one", () => {
    expect(sameDecision({ ...rejection, rejectionReasonId: "  " }, rejection)).toBe(true);
  });

  it("ignores the reason of an acceptance", () => {
    expect(sameDecision({ ...acceptance, rejectionReasonId: "demora" }, acceptance)).toBe(true);
  });
});

describe("decideInitialBudget and the rejection reason", () => {
  const reasons: readonly RejectionReason[] = [
    { id: "precio-elevado", label: "Precio elevado", active: true },
    { id: "demora", label: "Demora", active: false },
  ];
  const state = { budget: baseBudget, decision: null, workOrder: null };

  it("stores the id and the label of a sent reason", () => {
    const outcome = decideInitialBudget(state, { ...rejection, rejectionReasonId: " precio-elevado " }, decisionId, "2026-05-22", reasons);

    if (outcome.kind !== "recorded") throw new Error("expected a recorded outcome");
    expect(outcome.decision).toMatchObject({ rejectionReasonId: "precio-elevado", rejectionReasonLabel: "Precio elevado" });
  });

  it("refuses an inactive reason and an unknown one", () => {
    for (const rejectionReasonId of ["demora", "no-existe"]) {
      expect(() => decideInitialBudget(state, { ...rejection, rejectionReasonId }, decisionId, "2026-05-22", reasons))
        .toThrow(expect.objectContaining({ name: "RejectionReasonError", code: "invalid" }));
    }
  });

  it("refuses a rejection without a reason, or with a blank one", () => {
    for (const rejectionReasonId of [undefined, "", "  "]) {
      expect(() => decideInitialBudget(state, { ...rejection, rejectionReasonId }, decisionId, "2026-05-22", reasons))
        .toThrow(expect.objectContaining({ name: "RejectionReasonError", code: "required" }));
    }
  });

  it("stores no reason for an acceptance even when one is sent", () => {
    const outcome = decideInitialBudget(state, { ...acceptance, rejectionReasonId: "precio-elevado" }, decisionId, "2026-05-22", reasons);

    if (outcome.kind !== "recorded") throw new Error("expected a recorded outcome");
    expect(outcome.decision).not.toHaveProperty("rejectionReasonId");
    expect(outcome.decision).not.toHaveProperty("rejectionReasonLabel");
  });

  it("checks the reason after the replay: a recorded rejection replays even if its reason is inactive now", () => {
    const existing: BudgetDecision = { ...rejection, id: decisionId, budgetId: baseBudget.id, rejectionReasonId: "demora", rejectionReasonLabel: "Demora" };

    const outcome = decideInitialBudget(
      { budget: { ...baseBudget, status: "rejected" }, decision: existing, workOrder: null },
      { ...rejection, rejectionReasonId: "demora" }, decisionId, "2026-05-22", reasons,
    );

    expect(outcome).toEqual({ kind: "replayed", decision: existing, workOrder: null });
  });

  it("asks for the reason before the replay comparison, like the database (S3-C11)", () => {
    const existing: BudgetDecision = { ...rejection, id: decisionId, budgetId: baseBudget.id, rejectionReasonId: "demora", rejectionReasonLabel: "Demora" };
    const decided = { budget: { ...baseBudget, status: "rejected" as const }, decision: existing, workOrder: null };

    for (const rejectionReasonId of [undefined, "", "  "]) {
      expect(() => decideInitialBudget(decided, { ...rejection, rejectionReasonId }, decisionId, "2026-05-22", reasons))
        .toThrow(expect.objectContaining({ name: "RejectionReasonError", code: "required" }));
    }
  });

  it("asks for the reason before the budget state checks", () => {
    const draft = { budget: { ...baseBudget, status: "draft" as const }, decision: null, workOrder: null };

    expect(() => decideInitialBudget(draft, rejection, decisionId, "2026-05-22", reasons))
      .toThrow(expect.objectContaining({ name: "RejectionReasonError", code: "required" }));
  });

  it("conflicts when the retry carries another reason", () => {
    const existing: BudgetDecision = { ...rejection, id: decisionId, budgetId: baseBudget.id, rejectionReasonId: "demora", rejectionReasonLabel: "Demora" };

    expect(() => decideInitialBudget(
      { budget: { ...baseBudget, status: "rejected" }, decision: existing, workOrder: null },
      { ...rejection, rejectionReasonId: "precio-elevado" }, decisionId, "2026-05-22", reasons,
    )).toThrow(DecisionConflictError);
  });
});
