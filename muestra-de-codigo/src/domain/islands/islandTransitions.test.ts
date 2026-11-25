import { describe, expect, it } from "vitest";
import { allowedActions, applyIslandAction, REASON_REQUIRED } from "./islandTransitions";
import {
  IslandTransitionError,
  type IslandAction,
  type IslandState,
  type RouteIsland,
} from "./types";

const ALL_STATES: IslandState[] = ["pending", "in_progress", "paused", "blocked", "completed", "skipped"];
const ALL_ACTIONS: IslandAction[] = ["start", "pause", "resume", "block", "unblock", "complete", "skip", "reopen"];

// Every arrow of the island state machine.
const VALID: Record<IslandState, IslandAction[]> = {
  pending: ["start", "block", "skip"],
  in_progress: ["pause", "block", "complete", "skip"],
  paused: ["resume", "block", "skip"],
  blocked: ["unblock", "skip"],
  completed: ["reopen"],
  skipped: [],
};

const T0 = "2026-05-20T09:00:00.000Z";
const T1 = "2026-05-20T10:00:00.000Z";
const T2 = "2026-05-20T11:30:00.000Z";
const ACTOR = "user-2";

function island(overrides: Partial<RouteIsland> = {}): RouteIsland {
  return {
    id: "ri-1",
    workOrderId: "wo-1",
    islandId: "isl-1",
    name: "Tapas de cilindros",
    phase: "repair",
    sortOrder: 2,
    state: "pending",
    origin: "budget",
    stateBeforeBlock: null,
    reason: null,
    estimatedMinutes: 150,
    external: null,
    intervals: [],
    startedAt: null,
    completedAt: null,
    updatedAt: T0,
    updatedBy: "user-1",
    ...overrides,
  };
}

function inProgress(overrides: Partial<RouteIsland> = {}): RouteIsland {
  return island({
    state: "in_progress",
    startedAt: T0,
    intervals: [{ startedAt: T0, endedAt: null, kind: "in_house" }],
    ...overrides,
  });
}

const ctx = (now: string, reason?: string) => ({ now, actorUserId: ACTOR, reason });

describe("allowedActions", () => {
  it.each(ALL_STATES)("lists the actions of %s", (state) => {
    expect([...allowedActions(state)].sort()).toEqual([...VALID[state]].sort());
  });
});

describe("applyIslandAction", () => {
  const validPairs = ALL_STATES.flatMap((state) => VALID[state].map((action) => [state, action] as const));
  const invalidPairs = ALL_STATES.flatMap((state) =>
    ALL_ACTIONS.filter((action) => !VALID[state].includes(action)).map((action) => [state, action] as const),
  );

  function prepare(state: IslandState): RouteIsland {
    if (state === "in_progress") return inProgress();
    if (state === "paused") return island({ state, startedAt: T0, intervals: [{ startedAt: T0, endedAt: T1, kind: "in_house" }] });
    if (state === "blocked") return island({ state, stateBeforeBlock: "in_progress", reason: "Falta repuesto", startedAt: T0 });
    if (state === "completed") return island({ state, startedAt: T0, completedAt: T1, intervals: [{ startedAt: T0, endedAt: T1, kind: "in_house" }] });
    return island({ state });
  }

  it.each(validPairs)("applies %s + %s", (state, action) => {
    const next = applyIslandAction(prepare(state), action, ctx(T2, "Motivo de prueba"));
    expect(next.state).not.toBe(undefined);
    expect(next.updatedAt).toBe(T2);
    expect(next.updatedBy).toBe(ACTOR);
  });

  it.each(invalidPairs)("rejects %s + %s", (state, action) => {
    expect(() => applyIslandAction(prepare(state), action, ctx(T2, "Motivo de prueba"))).toThrow(IslandTransitionError);
  });

  it("explains the rejection in Spanish", () => {
    expect(() => applyIslandAction(prepare("completed"), "start", ctx(T2))).toThrow("La isla ya está terminada.");
    expect(() => applyIslandAction(prepare("skipped"), "start", ctx(T2))).toThrow("La isla fue omitida.");
    expect(() => applyIslandAction(prepare("pending"), "complete", ctx(T2))).toThrow("La isla todavía no empezó.");
    expect(() => applyIslandAction(prepare("blocked"), "pause", ctx(T2))).toThrow("La isla está bloqueada.");
    expect(() => applyIslandAction(prepare("paused"), "start", ctx(T2))).toThrow("La isla está en pausa.");
    expect(() => applyIslandAction(prepare("in_progress"), "start", ctx(T2))).toThrow("La isla ya está en curso.");
  });

  it("does not mutate the original island", () => {
    const original = inProgress();
    const snapshot = JSON.stringify(original);
    applyIslandAction(original, "pause", ctx(T1));
    expect(JSON.stringify(original)).toBe(snapshot);
  });

  it("targets the exact next state of each arrow", () => {
    expect(applyIslandAction(island(), "start", ctx(T1)).state).toBe("in_progress");
    expect(applyIslandAction(inProgress(), "pause", ctx(T1)).state).toBe("paused");
    expect(applyIslandAction(applyIslandAction(inProgress(), "pause", ctx(T1)), "resume", ctx(T2)).state).toBe("in_progress");
    expect(applyIslandAction(inProgress(), "block", ctx(T1, "Falta repuesto")).state).toBe("blocked");
    expect(applyIslandAction(inProgress(), "complete", ctx(T1)).state).toBe("completed");
    expect(applyIslandAction(inProgress(), "skip", ctx(T1, "No aplica")).state).toBe("skipped");
    expect(applyIslandAction(prepare("completed"), "reopen", ctx(T2, "Falló el control")).state).toBe("in_progress");
  });

  describe("reasons", () => {
    it("exposes block, skip and reopen as reason-required actions", () => {
      expect([...REASON_REQUIRED].sort()).toEqual(["block", "reopen", "skip"]);
    });

    it.each([
      ["block", () => inProgress()],
      ["skip", () => inProgress()],
      ["reopen", () => prepare("completed")],
    ] as const)("%s without a reason throws", (action, build) => {
      expect(() => applyIslandAction(build(), action, ctx(T1))).toThrow("Indicá el motivo.");
      expect(() => applyIslandAction(build(), action, ctx(T1, ""))).toThrow("Indicá el motivo.");
      expect(() => applyIslandAction(build(), action, ctx(T1, "   "))).toThrow("Indicá el motivo.");
      expect(() => applyIslandAction(build(), action, ctx(T1))).toThrow(IslandTransitionError);
    });

    it("stores the trimmed reason", () => {
      expect(applyIslandAction(inProgress(), "block", ctx(T1, "  Falta repuesto  ")).reason).toBe("Falta repuesto");
    });

    it("clears the reason when the island moves on without needing one", () => {
      const blocked = applyIslandAction(inProgress(), "block", ctx(T1, "Falta repuesto"));
      expect(applyIslandAction(blocked, "unblock", ctx(T2)).reason).toBeNull();
    });
  });

  describe("block and unblock", () => {
    it.each(["pending", "in_progress", "paused"] as const)("restores %s after unblock", (state) => {
      const before = prepare(state);
      const blocked = applyIslandAction(before, "block", ctx(T1, "Falta repuesto"));
      expect(blocked.stateBeforeBlock).toBe(state);
      const restored = applyIslandAction(blocked, "unblock", ctx(T2));
      expect(restored.state).toBe(state);
      expect(restored.stateBeforeBlock).toBeNull();
    });

    it("reopens an in-house interval when unblocking back to in_progress", () => {
      const blocked = applyIslandAction(inProgress(), "block", ctx(T1, "Falta repuesto"));
      const restored = applyIslandAction(blocked, "unblock", ctx(T2));
      expect(restored.intervals).toEqual([
        { startedAt: T0, endedAt: T1, kind: "in_house" },
        { startedAt: T2, endedAt: null, kind: "in_house" },
      ]);
    });

    it("does not open an interval when unblocking back to pending or paused", () => {
      const pending = applyIslandAction(applyIslandAction(island(), "block", ctx(T1, "x")), "unblock", ctx(T2));
      expect(pending.intervals).toEqual([]);
      const paused = applyIslandAction(applyIslandAction(applyIslandAction(inProgress(), "pause", ctx(T1)), "block", ctx(T1, "x")), "unblock", ctx(T2));
      expect(paused.intervals.filter((interval) => interval.endedAt === null)).toEqual([]);
    });
  });

  describe("start", () => {
    it("sets startedAt and opens an in_house interval", () => {
      const started = applyIslandAction(island(), "start", ctx(T1));
      expect(started.startedAt).toBe(T1);
      expect(started.intervals).toEqual([{ startedAt: T1, endedAt: null, kind: "in_house" }]);
    });

    it("keeps the original startedAt on later resumes", () => {
      const resumed = applyIslandAction(applyIslandAction(inProgress(), "pause", ctx(T1)), "resume", ctx(T2));
      expect(resumed.startedAt).toBe(T0);
      expect(resumed.intervals).toEqual([
        { startedAt: T0, endedAt: T1, kind: "in_house" },
        { startedAt: T2, endedAt: null, kind: "in_house" },
      ]);
    });
  });

  describe("closing intervals", () => {
    it.each([
      ["pause", undefined],
      ["block", "Falta repuesto"],
      ["complete", undefined],
      ["skip", "No aplica"],
    ] as const)("%s closes the open interval", (action, reason) => {
      const next = applyIslandAction(inProgress(), action, ctx(T1, reason));
      expect(next.intervals).toEqual([{ startedAt: T0, endedAt: T1, kind: "in_house" }]);
    });

    it("closes an open external interval too", () => {
      const withExternal = island({
        state: "in_progress",
        startedAt: T0,
        intervals: [
          { startedAt: T0, endedAt: T1, kind: "in_house" },
          { startedAt: T1, endedAt: null, kind: "external" },
        ],
      });
      const next = applyIslandAction(withExternal, "complete", ctx(T2));
      expect(next.intervals[1]).toEqual({ startedAt: T1, endedAt: T2, kind: "external" });
    });
  });

  describe("third-party work", () => {
    const sent = { provider: "Rectificadora Externa Demo", sentOn: "2026-05-20", promisedOn: "2026-05-27", receivedOn: null };
    const atThirdParty = () => inProgress({ external: sent });

    it("cannot be completed while the third-party work was not received", () => {
      expect(() => applyIslandAction(atThirdParty(), "complete", ctx(T1))).toThrow(IslandTransitionError);
      expect(() => applyIslandAction(atThirdParty(), "complete", ctx(T1))).toThrow(
        "Registrá la recepción del tercero antes de terminar la isla.",
      );
    });

    it("can be completed once the work came back", () => {
      const received = inProgress({ external: { ...sent, receivedOn: "2026-05-25" } });
      expect(applyIslandAction(received, "complete", ctx(T1)).state).toBe("completed");
    });

    it("can still be skipped, paused and blocked while at the third party", () => {
      expect(applyIslandAction(atThirdParty(), "skip", ctx(T1, "No hace falta")).state).toBe("skipped");
      expect(applyIslandAction(atThirdParty(), "pause", ctx(T1)).state).toBe("paused");
      expect(applyIslandAction(atThirdParty(), "block", ctx(T1, "Demora")).state).toBe("blocked");
    });

    it("reports an invalid transition before the third-party rule", () => {
      expect(() => applyIslandAction(island({ state: "paused", external: sent }), "complete", ctx(T1))).toThrow(
        "La isla está en pausa.",
      );
    });
  });

  describe("intervals while the piece is at a third party", () => {
    const sent = { provider: "Rectificadora Externa Demo", sentOn: "2026-05-20", promisedOn: "2026-05-27", receivedOn: null };
    const T3 = "2026-05-20T12:00:00.000Z";
    const away = (overrides: Partial<RouteIsland> = {}) =>
      island({
        state: "in_progress",
        startedAt: T0,
        external: sent,
        intervals: [
          { startedAt: T0, endedAt: T1, kind: "in_house" },
          { startedAt: T1, endedAt: null, kind: "external" },
        ],
        ...overrides,
      });
    const openKinds = (target: RouteIsland) =>
      target.intervals.filter((interval) => interval.endedAt === null).map((interval) => interval.kind);

    it.each([
      ["pause", undefined],
      ["block", "Demora"],
    ] as const)("%s leaves the external interval running", (action, reason) => {
      const next = applyIslandAction(away(), action, ctx(T2, reason));
      expect(next.intervals[1]).toEqual({ startedAt: T1, endedAt: null, kind: "external" });
    });

    it("pause and block close the in-house interval of an island that is back in the shop", () => {
      const paused = applyIslandAction(inProgress(), "pause", ctx(T1));
      expect(openKinds(paused)).toEqual([]);
    });

    it("resume does not open in-house time while the piece is away", () => {
      const paused = applyIslandAction(away(), "pause", ctx(T2));
      const resumed = applyIslandAction(paused, "resume", ctx(T3));
      expect(openKinds(resumed)).toEqual(["external"]);
      expect(resumed.intervals.filter((interval) => interval.kind === "in_house")).toHaveLength(1);
    });

    it("unblock back to in_progress does not open in-house time while the piece is away", () => {
      const blocked = applyIslandAction(away(), "block", ctx(T2, "Demora"));
      const restored = applyIslandAction(blocked, "unblock", ctx(T3));
      expect(restored.state).toBe("in_progress");
      expect(openKinds(restored)).toEqual(["external"]);
    });

    it("reopen opens in-house time once the work came back", () => {
      const completed = applyIslandAction(
        inProgress({ external: { ...sent, receivedOn: "2026-05-25" } }),
        "complete",
        ctx(T1),
      );
      const reopened = applyIslandAction(completed, "reopen", ctx(T2, "Falló el control"));
      expect(openKinds(reopened)).toEqual(["in_house"]);
    });

    it("never opens a second in-house interval when one is already open", () => {
      const started = applyIslandAction(island({ intervals: [{ startedAt: T0, endedAt: null, kind: "in_house" }] }), "start", ctx(T1));
      expect(started.intervals.filter((interval) => interval.kind === "in_house")).toHaveLength(1);
    });

    it("skip closes the external interval too", () => {
      const skipped = applyIslandAction(away(), "skip", ctx(T2, "El cliente retira la pieza"));
      expect(openKinds(skipped)).toEqual([]);
    });
  });

  describe("complete and reopen", () => {
    it("complete sets completedAt", () => {
      expect(applyIslandAction(inProgress(), "complete", ctx(T1)).completedAt).toBe(T1);
    });

    it("reopen clears completedAt and opens a new interval", () => {
      const completed = applyIslandAction(inProgress(), "complete", ctx(T1));
      const reopened = applyIslandAction(completed, "reopen", ctx(T2, "Falló el control"));
      expect(reopened.completedAt).toBeNull();
      expect(reopened.reason).toBe("Falló el control");
      expect(reopened.startedAt).toBe(T0);
      expect(reopened.intervals).toEqual([
        { startedAt: T0, endedAt: T1, kind: "in_house" },
        { startedAt: T2, endedAt: null, kind: "in_house" },
      ]);
    });
  });
});
