import {
  calendarDayNumber,
  calendarWeekday,
  localCalendarDateKey,
} from '../../utils/calendarDate.ts';

export type ExposurePlanStatus = 'not-configured' | 'before-start' | 'active' | 'complete' | 'deadline-passed';
export type ExposureWorkload = 'normal' | 'high' | 'extreme';

export interface ExposurePlanInput {
  today?: string;
  startDate?: string;
  targetDate?: string;
  unseen: number;
  due: number;
  introducedToday?: number;
  weekendMultiplier?: number;
}

export interface ExposurePlan {
  status: ExposurePlanStatus;
  today: string;
  startDate: string | null;
  targetDate: string | null;
  weekendMultiplier: number;
  remainingDays: number;
  remainingWeight: number;
  todayWeight: number;
  /** Total unseen-card allowance for this local day, including cards already introduced today. */
  dailyLimit: number;
  /** Additional unseen cards recommended from the current point in the day. */
  recommendedNew: number;
  /** First-day recommendation when the configured window has not started yet. */
  firstDayNew: number;
  dueReviews: number;
  recommendedTotal: number;
  workload: ExposureWorkload;
  deadlinePassed: boolean;
}

function boundedCount(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function boundedWeekendMultiplier(value: number | undefined): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(4, value as number));
}

function dayWeight(day: number, weekendMultiplier: number): number {
  const weekday = calendarWeekday(day);
  return weekday === 0 || weekday === 6 ? weekendMultiplier : 1;
}

function rangeWeight(firstDay: number, lastDay: number, weekendMultiplier: number): number {
  let total = 0;
  for (let day = firstDay; day <= lastDay; day += 1) total += dayWeight(day, weekendMultiplier);
  return total;
}

function workloadFor(total: number): ExposureWorkload {
  if (total >= 500) return 'extreme';
  if (total >= 200) return 'high';
  return 'normal';
}

function requireDay(value: string, label: string): number {
  const day = calendarDayNumber(value);
  if (day === null) throw new RangeError(`${label} must be a real calendar date in YYYY-MM-DD form`);
  return day;
}

export function buildExposurePlan(input: ExposurePlanInput): ExposurePlan {
  const today = input.today ?? localCalendarDateKey();
  const todayDay = requireDay(today, 'today');
  const unseen = boundedCount(input.unseen);
  const due = boundedCount(input.due);
  const introducedToday = boundedCount(input.introducedToday ?? 0);
  const weekendMultiplier = boundedWeekendMultiplier(input.weekendMultiplier);
  const targetDate = input.targetDate?.trim() || null;
  const startDate = input.startDate?.trim() || today;

  const base = {
    today,
    startDate: targetDate ? startDate : null,
    targetDate,
    weekendMultiplier,
    dueReviews: due,
    deadlinePassed: false,
  };

  if (!targetDate) {
    return {
      ...base,
      status: 'not-configured',
      remainingDays: 0,
      remainingWeight: 0,
      todayWeight: dayWeight(todayDay, weekendMultiplier),
      dailyLimit: 0,
      recommendedNew: 0,
      firstDayNew: 0,
      recommendedTotal: due,
      workload: workloadFor(due),
    };
  }

  const startDay = requireDay(startDate, 'startDate');
  const targetDay = requireDay(targetDate, 'targetDate');
  if (startDay > targetDay) throw new RangeError('startDate must not be after targetDate');

  if (unseen === 0) {
    return {
      ...base,
      status: 'complete',
      remainingDays: Math.max(0, targetDay - Math.max(todayDay, startDay) + 1),
      remainingWeight: todayDay <= targetDay
        ? rangeWeight(Math.max(todayDay, startDay), targetDay, weekendMultiplier)
        : 0,
      todayWeight: dayWeight(todayDay, weekendMultiplier),
      dailyLimit: introducedToday,
      recommendedNew: 0,
      firstDayNew: 0,
      recommendedTotal: due,
      workload: workloadFor(due),
    };
  }

  if (todayDay > targetDay) {
    return {
      ...base,
      status: 'deadline-passed',
      remainingDays: 0,
      remainingWeight: 0,
      todayWeight: dayWeight(todayDay, weekendMultiplier),
      dailyLimit: 0,
      recommendedNew: 0,
      firstDayNew: 0,
      recommendedTotal: due,
      workload: workloadFor(due),
      deadlinePassed: true,
    };
  }

  if (todayDay < startDay) {
    const remainingWeight = rangeWeight(startDay, targetDay, weekendMultiplier);
    const firstDayNew = Math.min(unseen, Math.ceil(unseen * dayWeight(startDay, weekendMultiplier) / remainingWeight));
    return {
      ...base,
      status: 'before-start',
      remainingDays: targetDay - startDay + 1,
      remainingWeight,
      todayWeight: dayWeight(todayDay, weekendMultiplier),
      dailyLimit: 0,
      recommendedNew: 0,
      firstDayNew,
      recommendedTotal: due,
      workload: workloadFor(due),
    };
  }

  const remainingDays = targetDay - todayDay + 1;
  const remainingWeight = rangeWeight(todayDay, targetDay, weekendMultiplier);
  const todayWeight = dayWeight(todayDay, weekendMultiplier);
  // Reconstruct the day's starting unseen count so recalculation after each card does not
  // move the quota. The quota remains finite and is always bounded by available cards.
  const unseenAtDayStart = unseen + introducedToday;
  const dailyLimit = Math.min(
    unseenAtDayStart,
    Math.ceil(unseenAtDayStart * todayWeight / remainingWeight),
  );
  const recommendedNew = Math.max(0, dailyLimit - introducedToday);
  const recommendedTotal = recommendedNew + due;

  return {
    ...base,
    status: 'active',
    remainingDays,
    remainingWeight,
    todayWeight,
    dailyLimit,
    recommendedNew,
    firstDayNew: dailyLimit,
    recommendedTotal,
    workload: workloadFor(recommendedTotal),
  };
}

export function studyGoalQuotaKey(projectId: string): string {
  return `${projectId}|study-goal`;
}
