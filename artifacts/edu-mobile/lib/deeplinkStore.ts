// Lightweight mutable store for cross-screen deeplink navigation.
//
// WHY: expo-router does not pass URL params to already-mounted tab screens
// when navigating from a sibling stack screen (e.g. /notifications → /(tabs)/schedule).
// Writing to this store before calling router.push(), then reading + clearing it
// inside useFocusEffect on the target tab screen, is the reliable workaround.
//
// Stack screens (StaffGradeBook, StaffSalary, etc.) receive params normally via
// router.navigate({ pathname, params }) — no store needed for those.

export interface CalendarDeeplink {
  date?: string;      // YYYY-MM-DD
  sessionId?: string; // classSessionId — accurate session highlight (new)
  classId?: string;   // kept for backward compat; web uses this for class-tab selection
}

export interface AssignmentsDeeplink {
  date?: string;    // YYYY-MM-DD
  classId?: string; // filter assignments to this class
}

export interface ChatDeeplink {
  topicId: string;         // grpXXXXXXXXXX — dùng để mở đúng kênh qua Tinode
  referenceType?: string;  // "class_chat" | "group_chat"
}

export interface GradesDeeplink {
  classId?: string; // auto-select this class tab in ScoreSheet
}

export interface TasksDeeplink {
  taskId?: string; // auto-open this task in detail modal
}

let _calendar: CalendarDeeplink | null = null;
// Set to true when the live listener has already applied the deeplink to a
// focused screen instance.  popCalendarDeeplink() checks this so that a
// re-mounted instance's useFocusEffect doesn't re-apply an already-consumed
// deeplink — it just clears the store and returns null.
let _calendarHandledByListener = false;
let _assignments: AssignmentsDeeplink | null = null;
let _chat: ChatDeeplink | null = null;
let _grades: GradesDeeplink | null = null;
let _tasks: TasksDeeplink | null = null;

// ── Live event listeners ──────────────────────────────────────────────────────
// Needed for cold-start / background-tap cases where router.navigate() to an
// already-active tab does NOT trigger useFocusEffect → the store value would
// never be consumed.  Listeners receive the deeplink immediately when it is set.

type CalendarListener = (dl: CalendarDeeplink) => void;
const _calendarListeners = new Set<CalendarListener>();

/** Subscribe to calendar deeplink events (call inside a useEffect). */
export function onCalendarDeeplink(cb: CalendarListener) { _calendarListeners.add(cb); }
/** Unsubscribe (call in the useEffect cleanup). */
export function offCalendarDeeplink(cb: CalendarListener) { _calendarListeners.delete(cb); }

/** Write before navigating to the Calendar (schedule) tab. */
export function setCalendarDeeplink(v: CalendarDeeplink): void {
  _calendar = v;
  _calendarHandledByListener = false; // reset on every new deeplink
  _calendarListeners.forEach((cb) => cb(v));
}

/**
 * Called by the live listener after it has applied a deeplink to a focused
 * screen instance.  Marks the store value as "already handled" without clearing
 * it, so that a subsequently re-mounted instance's useFocusEffect knows NOT to
 * re-apply the deeplink — it will just clear the store and return null.
 */
export function markCalendarDeeplinkHandled(): void {
  _calendarHandledByListener = true;
}

/**
 * Read-and-clear once.  Call inside the schedule tab's useFocusEffect.
 *
 * Returns null (and still clears the store) when the live listener already
 * applied this deeplink — prevents a re-mounted screen from re-applying it
 * and jumping to the wrong date.
 */
export function popCalendarDeeplink(): CalendarDeeplink | null {
  const v = _calendarHandledByListener ? null : _calendar;
  _calendar = null;
  _calendarHandledByListener = false;
  return v;
}

/** Write before navigating to the Assignments (homework) tab. */
export function setAssignmentsDeeplink(v: AssignmentsDeeplink): void {
  _assignments = v;
}

/** Read-and-clear once. Call inside the homework tab's useFocusEffect. */
export function popAssignmentsDeeplink(): AssignmentsDeeplink | null {
  const v = _assignments;
  _assignments = null;
  return v;
}

/** Write before navigating to the Chat tab. */
export function setChatDeeplink(v: ChatDeeplink): void {
  _chat = v;
}

/** Read-and-clear once. Call inside the chat tab's useFocusEffect. */
export function popChatDeeplink(): ChatDeeplink | null {
  const v = _chat;
  _chat = null;
  return v;
}

/** Write before navigating to the Grades (ScoreSheet) tab. */
export function setGradesDeeplink(v: GradesDeeplink): void {
  _grades = v;
}

/** Read-and-clear once. Call inside the grades tab's useFocusEffect. */
export function popGradesDeeplink(): GradesDeeplink | null {
  const v = _grades;
  _grades = null;
  return v;
}

/** Write before navigating to the Tasks (StaffTasks) tab. */
export function setTasksDeeplink(v: TasksDeeplink): void {
  _tasks = v;
}

/** Read-and-clear once. Call inside the tasks tab's useFocusEffect. */
export function popTasksDeeplink(): TasksDeeplink | null {
  const v = _tasks;
  _tasks = null;
  return v;
}
