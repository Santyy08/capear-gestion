import {
  IslandTransitionError,
  type IslandAction,
  type IslandInterval,
  type IslandState,
  type RouteIsland,
} from "./types";

interface Arrow {
  to: IslandState | "restore";
}

// Transition table of the island state machine. `restore` returns to the state held in `stateBeforeBlock`.
const TRANSITIONS: Record<IslandState, Partial<Record<IslandAction, Arrow>>> = {
  pending: { start: { to: "in_progress" }, block: { to: "blocked" }, skip: { to: "skipped" } },
  in_progress: {
    pause: { to: "paused" },
    block: { to: "blocked" },
    complete: { to: "completed" },
    skip: { to: "skipped" },
  },
  paused: { resume: { to: "in_progress" }, block: { to: "blocked" }, skip: { to: "skipped" } },
  blocked: { unblock: { to: "restore" }, skip: { to: "skipped" } },
  completed: { reopen: { to: "in_progress" } },
  skipped: {},
};

const REJECTION: Record<IslandState, string> = {
  pending: "La isla todavía no empezó.",
  in_progress: "La isla ya está en curso.",
  paused: "La isla está en pausa.",
  blocked: "La isla está bloqueada.",
  completed: "La isla ya está terminada.",
  skipped: "La isla fue omitida.",
};

export const REASON_REQUIRED: ReadonlySet<IslandAction> = new Set<IslandAction>(["block", "skip", "reopen"]);

export function allowedActions(state: IslandState): IslandAction[] {
  return Object.keys(TRANSITIONS[state]) as IslandAction[];
}

/** Closes every open interval, or only the open ones of `kind` when it is given. */
function closeOpenIntervals(intervals: IslandInterval[], now: string, kind?: IslandInterval["kind"]): IslandInterval[] {
  return intervals.map((interval) =>
    interval.endedAt === null && (kind === undefined || interval.kind === kind) ? { ...interval, endedAt: now } : interval,
  );
}

/** Sent to a third party and not received yet: the external interval counts, in-house time does not. */
function isAtThirdParty(island: RouteIsland): boolean {
  return island.external !== null && island.external.receivedOn === null;
}

/** Opens in-house time unless the piece is away or an in-house interval is already open. */
function openInHouseInterval(island: RouteIsland, now: string): IslandInterval[] {
  const alreadyOpen = island.intervals.some((interval) => interval.kind === "in_house" && interval.endedAt === null);
  if (isAtThirdParty(island) || alreadyOpen) return island.intervals;
  return [...island.intervals, { startedAt: now, endedAt: null, kind: "in_house" }];
}

export function applyIslandAction(
  island: RouteIsland,
  action: IslandAction,
  ctx: { now: string; actorUserId: string; reason?: string },
): RouteIsland {
  const arrow = TRANSITIONS[island.state][action];
  if (!arrow) {
    throw new IslandTransitionError(REJECTION[island.state]);
  }

  const reason = ctx.reason?.trim() ?? "";
  if (REASON_REQUIRED.has(action) && reason === "") {
    throw new IslandTransitionError("Indicá el motivo.");
  }

  // Work sent to a third party has to come back (and be registered) before the island can be finished.
  if (action === "complete" && island.external !== null && island.external.receivedOn === null) {
    throw new IslandTransitionError("Registrá la recepción del tercero antes de terminar la isla.");
  }

  const nextState = arrow.to === "restore" ? (island.stateBeforeBlock ?? "pending") : arrow.to;
  const next: RouteIsland = {
    ...island,
    state: nextState,
    reason: REASON_REQUIRED.has(action) ? reason : null,
    stateBeforeBlock: action === "block" ? island.state : null,
    updatedAt: ctx.now,
    updatedBy: ctx.actorUserId,
  };

  switch (action) {
    case "start":
      next.startedAt = island.startedAt ?? ctx.now;
      next.intervals = openInHouseInterval(island, ctx.now);
      break;
    case "resume":
      next.intervals = openInHouseInterval(island, ctx.now);
      break;
    case "unblock":
      next.intervals = nextState === "in_progress" ? openInHouseInterval(island, ctx.now) : island.intervals;
      break;
    case "reopen":
      next.completedAt = null;
      next.intervals = openInHouseInterval(island, ctx.now);
      break;
    case "complete":
      next.completedAt = ctx.now;
      next.intervals = closeOpenIntervals(island.intervals, ctx.now);
      break;
    case "pause":
    case "block":
      // The external interval keeps running until the reception.
      next.intervals = closeOpenIntervals(island.intervals, ctx.now, "in_house");
      break;
    case "skip":
      next.intervals = closeOpenIntervals(island.intervals, ctx.now);
      break;
  }

  return next;
}
