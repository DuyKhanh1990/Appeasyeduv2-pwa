export interface SessionDetail {
  sessionDate: string;
  sessionIndex: number | null;
  durationHours: number;
  attendedCount: number;
  isEligible: boolean;
  coefficient: number | null;
}

export interface SalaryClass {
  classId: string;
  className: string;
  role: string;
  packageId: string | null;
  packageName: string | null;
  packageType: string | null;
  totalEligibleSessions: number;
  totalSalary: number;
  /** Populated from breakdown API — sessions embedded per class */
  sessions?: SessionDetail[];
}

export interface SalarySummary {
  salaryTableId: string;
  salaryTableName: string;
  startDate: string;
  endDate: string;
  locationName: string;
  classes: SalaryClass[];
  grandTotal: number;
}

/** Shape returned by GET /api/mobile/staff/salary-tables/:id/breakdown */
export interface SalaryBreakdown {
  salaryTableId: string;
  salaryTableName: string;
  startDate: string;
  endDate: string;
  locationName: string;
  grandTotal: number;
  classes: (SalaryClass & { sessions: SessionDetail[] })[];
}

// ─── Legacy store (list screen summary + session map) ─────────────────────────
export type SessionMap = Record<string, SessionDetail[]>;

let _selectedTable: SalarySummary | null = null;
let _sessionMap: SessionMap = {};

export function setSelectedSalaryTable(table: SalarySummary, map: SessionMap) {
  _selectedTable = table;
  _sessionMap = map;
}

export function getSelectedSalaryTable(): { table: SalarySummary | null; sessionMap: SessionMap } {
  return { table: _selectedTable, sessionMap: _sessionMap };
}

// ─── Breakdown store (detail screen — sessions embedded in classes) ────────────
let _selectedBreakdown: SalaryBreakdown | null = null;

export function setSelectedBreakdown(breakdown: SalaryBreakdown) {
  _selectedBreakdown = breakdown;
}

export function getSelectedBreakdown(): SalaryBreakdown | null {
  return _selectedBreakdown;
}
