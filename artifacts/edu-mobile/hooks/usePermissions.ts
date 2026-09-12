/**
 * usePermissions — derives UI-level permission flags from the MobilePermissions API response.
 *
 * Rules:
 *   - When permissions haven't loaded yet (null), default to permissive for staff and
 *     restrictive for student/parent so the UI doesn't flash items in/out.
 *   - A flag is ONLY false when the API explicitly says false — unknown = allow.
 */
import { useAuth } from "@/context/AuthContext";

export interface AppPermissions {
  // ── Tab bar ──────────────────────────────────────────────────────────────
  canViewTasks: boolean;
  canViewSchedule: boolean;

  // ── News feed ─────────────────────────────────────────────────────────────
  canViewNewsFeed: boolean;
  canCreateNews: boolean;
  canEditNews: boolean;
  canDeleteNews: boolean;

  // ── Academic screen cards ─────────────────────────────────────────────────
  mySpaceAssignments: boolean;    // "Bài tập - Kiểm tra"
  mySpaceScoreSheet: boolean;     // "Bảng điểm"
  canViewLearningOverview: boolean; // "HV sắp hết lịch" + "Lớp sắp kết thúc"
  mySpacePayroll: boolean;        // "Bảng tổng lương" + "Lương đứng lớp"
  mySpaceInvoices: boolean;       // "Hoá đơn"

  // ── Dashboard ─────────────────────────────────────────────────────────────
  dashboardCanView: boolean;
  dashboardTabCustomers: boolean;
  dashboardTabTraining: boolean;
  dashboardTabFinance: boolean;
}

export function usePermissions(): AppPermissions {
  const { permissions, user } = useAuth();
  const isStaff = !!user && user.role !== "student" && user.role !== "parent";
  const f = permissions?.features;
  const ms = f?.mySpace;

  // Helper: return value if permissions loaded, else use fallback
  const perm = <T>(value: T | undefined, fallback: T): T =>
    f !== undefined ? (value ?? fallback) : fallback;

  return {
    // Tabs
    canViewTasks:             perm(f?.tasks.canView, isStaff),
    canViewSchedule:          perm(ms?.calendar.canView, true),

    // News feed
    canViewNewsFeed:          perm(f?.newsFeed.canView, true),
    canCreateNews:            perm(f?.newsFeed.canCreate, false),
    canEditNews:              perm(f?.newsFeed.canEdit, false),
    canDeleteNews:            perm(f?.newsFeed.canDelete, false),

    // Academic / My Space
    // Fallback = true cho assignments/scoreSheet/invoices: cả staff lẫn student/parent đều có quyền
    // theo DB hiện tại — dùng true tránh flash disabled → enabled khi API chưa load xong.
    // Payroll chỉ có staff nên giữ isStaff làm fallback.
    mySpaceAssignments:       perm(ms?.assignments.canView, true),
    mySpaceScoreSheet:        perm(ms?.scoreSheet.canView, true),
    canViewLearningOverview:  perm(f?.learningOverview.canView, isStaff),
    mySpacePayroll:           perm(ms?.payroll.canView, isStaff),
    mySpaceInvoices:          perm(ms?.invoices.canView, true),

    // Dashboard
    dashboardCanView:         perm(f?.dashboard.canView, isStaff),
    dashboardTabCustomers:    perm(f?.dashboard.tabs?.customers, false),
    dashboardTabTraining:     perm(f?.dashboard.tabs?.training, true),
    dashboardTabFinance:      perm(f?.dashboard.tabs?.finance, false),
  };
}
