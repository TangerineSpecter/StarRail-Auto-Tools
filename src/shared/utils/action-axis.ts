export const FIRST_CYCLE_ACTION_VALUE = 150;
export const FOLLOWING_CYCLE_ACTION_VALUE = 100;

const ACTION_VALUE_NUMERATOR = 10_000;
const MAX_SIMULATED_ACTIONS = 10_000;

export interface StaticActionAxisInput {
  speed: number;
  cycles: number;
  /** One-time battle-entry action advance, expressed as a decimal (40% = 0.4). */
  initialAdvance?: number;
}

export interface StaticActionEvent {
  ordinal: number;
  actionValue: number;
  cycle: number;
  initialAdvanceApplied: boolean;
}

function assertPositiveFinite(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label}必须是正数`);
}

export function actionAxisHorizon(cycles: number): number {
  if (!Number.isInteger(cycles) || cycles < 1 || cycles > 10) {
    throw new RangeError("轮数必须是 1～10 的整数");
  }
  return FIRST_CYCLE_ACTION_VALUE + (cycles - 1) * FOLLOWING_CYCLE_ACTION_VALUE;
}

export function actionCycleAt(actionValue: number): number {
  if (actionValue <= FIRST_CYCLE_ACTION_VALUE) return 1;
  return Math.ceil((actionValue - FIRST_CYCLE_ACTION_VALUE) / FOLLOWING_CYCLE_ACTION_VALUE) + 1;
}

export function simulateStaticActionAxis(input: StaticActionAxisInput): StaticActionEvent[] {
  assertPositiveFinite(input.speed, "速度");
  const horizon = actionAxisHorizon(input.cycles);
  const initialAdvance = input.initialAdvance ?? 0;
  if (!Number.isFinite(initialAdvance) || initialAdvance < 0 || initialAdvance > 1) {
    throw new RangeError("开局行动提前必须在 0～1 之间");
  }

  const interval = ACTION_VALUE_NUMERATOR / input.speed;
  const events: StaticActionEvent[] = [];
  let nextActionValue = interval * (1 - initialAdvance);

  while (nextActionValue <= horizon + 1e-9) {
    if (events.length >= MAX_SIMULATED_ACTIONS) throw new RangeError("行动次数超出安全上限");
    events.push({
      ordinal: events.length + 1,
      actionValue: nextActionValue,
      cycle: actionCycleAt(nextActionValue),
      initialAdvanceApplied: events.length === 0 && initialAdvance > 0,
    });
    nextActionValue += interval;
  }

  return events;
}

export function countStaticActions(input: StaticActionAxisInput): number {
  return simulateStaticActionAxis(input).length;
}

export function cycleBoundaries(cycles: number): number[] {
  const horizon = actionAxisHorizon(cycles);
  return Array.from({ length: cycles }, (_, index) => {
    const boundary = FIRST_CYCLE_ACTION_VALUE + index * FOLLOWING_CYCLE_ACTION_VALUE;
    return Math.min(boundary, horizon);
  });
}
