import { useEffect, useId, useState, type FormEvent } from "react";
import {
  Button,
  Callout,
  Dialog,
  DialogClose,
  DialogContent,
  Field,
  Select,
  TextInput,
  Textarea,
  useToast,
} from "../../components/ui";
import { BudgetExpiredError } from "../../domain/budgets/errors";
import { RejectionReasonError } from "../../domain/budgets/rejectionReason";
import type { DecisionChannel, DecisionResult } from "../../domain/budgets/types";
import { useRepositories } from "../../data/context/RepositoryContext";
import { formatDate } from "../../lib/format";
import {
  DecisionConfirmButton,
  DecisionResultField,
  focusDecisionDialogItself,
  type DecisionChoice,
} from "../shared/DecisionResultField";
import { FormGrid } from "../shared/FormLayout";
import { REJECTION_REASON_REQUIRED_MESSAGE, RejectionReasonField, useRejectionReasons } from "../shared/RejectionReasonField";
import { decisionChannelLabels } from "../shared/statusViews";

const defaultNotes: Record<DecisionResult, string> = {
  accepted: "El cliente acepta el presupuesto y autoriza el ingreso del trabajo.",
  rejected: "El cliente no acepta el presupuesto.",
};

const channels: DecisionChannel[] = ["whatsapp", "email", "phone", "in_person"];

interface BudgetDecisionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  budgetId: string;
  budgetNumber: string;
  clientName: string;
  defaultPerson: string;
  onAccepted: (workOrderNumber: string) => void;
  onRejected: () => void;
}

export function BudgetDecisionDialog({
  open,
  onOpenChange,
  budgetId,
  budgetNumber,
  clientName,
  defaultPerson,
  onAccepted,
  onRejected,
}: BudgetDecisionDialogProps) {
  const formId = useId();
  const { notify } = useToast();
  const { budgetRepository, clock, notifyDataChanged } = useRepositories();
  const reasons = useRejectionReasons();
  const hintId = `${formId}-result-hint`;
  const [result, setResult] = useState<DecisionChoice>("");
  const [channel, setChannel] = useState<DecisionChannel>("whatsapp");
  const [person, setPerson] = useState(defaultPerson);
  const [notes, setNotes] = useState("");
  const [notesEdited, setNotesEdited] = useState(false);
  const [personError, setPersonError] = useState<string | undefined>();
  const [reasonId, setReasonId] = useState("");
  const [reasonError, setReasonError] = useState<string | undefined>();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // Fixed once per opening and reused on retries, so a retry after a conflict keeps the same instant.
  const [decidedAt, setDecidedAt] = useState(() => clock.decisionInstant());

  // The parent keeps this component mounted and controls `open` (it follows `?decision=1`), so each opening starts clean
  // (a decision never opens with an option chosen). Adjusting state while rendering means the first frame is already clean.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setResult("");
      setChannel("whatsapp");
      setPerson(defaultPerson);
      setNotes("");
      setNotesEdited(false);
      setPersonError(undefined);
      setReasonId("");
      setReasonError(undefined);
    }
  }

  // A new opening is detected here rather than in onOpenChange; the clock and the busy flags are not render state.
  useEffect(() => {
    if (!open) return;
    setDecidedAt(clock.decisionInstant());
    setPending(false);
    setSubmitError(null);
  }, [open, clock]);

  function handleOpenChange(nextOpen: boolean) {
    if (pending) return;
    onOpenChange(nextOpen);
  }

  function changeResult(next: DecisionResult) {
    setResult(next);
    // Untouched notes follow the decision so a rejection never says the client accepted.
    if (!notesEdited) setNotes(defaultNotes[next]);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // The confirm button is blocked until a result is chosen; Enter inside a field must not get around it.
    if (pending || result === "") return;
    setSubmitError(null);
    const confirmedByPerson = person.trim();
    const missingReason = result === "rejected" && !reasonId;
    if (!confirmedByPerson) setPersonError("Ingresá quién confirmó la decisión.");
    if (missingReason) setReasonError(REJECTION_REASON_REQUIRED_MESSAGE);
    if (!confirmedByPerson || missingReason) return;
    const input = {
      result, decidedAt, channel, confirmedByPerson, notes: notes.trim() || undefined,
      // Only a rejection carries a reason.
      ...(result === "rejected" ? { rejectionReasonId: reasonId } : {}),
    };
    setPending(true);
    try {
      const { workOrder } = await budgetRepository.recordInitialDecision(budgetId, input);
      await notifyDataChanged();
      if (result === "accepted" && workOrder) {
        onAccepted(workOrder.number);
      } else {
        onRejected();
      }
    } catch (caught: unknown) {
      // The server found the budget expired: reload it so the page behind shows the new state.
      // The reload closes this dialog (the budget is no longer decidable), so the reason stays visible as a toast.
      if (caught instanceof BudgetExpiredError) {
        await notifyDataChanged();
        notify({ tone: "error", title: caught.message });
      }
      // The reason was deactivated since the list was loaded: the list reloads and the person picks another.
      if (caught instanceof RejectionReasonError && caught.code === "invalid") {
        setReasonId("");
        reasons.reload();
      }
      setSubmitError(caught instanceof Error ? caught.message : "No pudimos registrar la decisión. Intentá nuevamente.");
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        size="md"
        title="Registrar decisión del cliente"
        description={`Presupuesto ${budgetNumber} · ${clientName}`}
        onOpenAutoFocus={focusDecisionDialogItself}
        onEscapeKeyDown={(event) => {
          if (pending) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (pending) event.preventDefault();
        }}
        footer={
          <>
            <DialogClose asChild>
              <Button disabled={pending}>Cancelar</Button>
            </DialogClose>
            <DecisionConfirmButton
              formId={formId}
              value={result}
              hintId={hintId}
              loading={pending}
              disabled={result === "rejected" && reasons.active === undefined}
            />
          </>
        }
      >
        <form id={formId} className="budget-decision" noValidate onSubmit={handleSubmit}>
          <DecisionResultField
            name="decision-result"
            value={result}
            hintId={hintId}
            disabled={pending}
            onChange={changeResult}
          />
          <FormGrid>
            <Field label="Fecha" hint="Se registra con la fecha de hoy.">
              {(field) => <TextInput {...field} value={formatDate(decidedAt)} readOnly disabled={pending} />}
            </Field>
            <Field label="Medio de confirmación" required>
              {(field) => (
                <Select
                  {...field}
                  value={channel}
                  disabled={pending}
                  onChange={(event) => setChannel(event.target.value as DecisionChannel)}
                >
                  {channels.map((value) => (
                    <option key={value} value={value}>
                      {decisionChannelLabels[value]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Persona que confirmó" required error={personError} className="form-section__full">
              {(field) => (
                <TextInput
                  {...field}
                  value={person}
                  autoComplete="name"
                  disabled={pending}
                  onChange={(event) => {
                    setPerson(event.target.value);
                    if (personError) setPersonError(undefined);
                  }}
                />
              )}
            </Field>
            {result === "rejected" ? (
              <RejectionReasonField
                value={reasonId}
                disabled={pending}
                error={reasonError}
                onChange={(next) => {
                  setReasonId(next);
                  if (reasonError) setReasonError(undefined);
                }}
              />
            ) : null}
            <Field label="Observaciones" className="form-section__full">
              {(field) => (
                <Textarea
                  {...field}
                  rows={3}
                  value={notes}
                  disabled={pending}
                  onChange={(event) => {
                    setNotes(event.target.value);
                    setNotesEdited(true);
                  }}
                />
              )}
            </Field>
          </FormGrid>
          {result === "accepted" ? (
            <Callout tone="info">
              Se genera la orden de trabajo y queda esperando el ingreso del motor. Si te equivocaste, cancelá la orden con un motivo.
            </Callout>
          ) : null}
          {result === "rejected" ? (
            <Callout tone="neutral">
              El presupuesto queda rechazado y no se genera una orden. Si lo reconsidera, creá un presupuesto nuevo desde este.
            </Callout>
          ) : null}
          {submitError ? (
            <p role="alert" className="budget-decision__error">
              {submitError}
            </p>
          ) : null}
        </form>
      </DialogContent>
    </Dialog>
  );
}
