import { Router } from "express";
import { db, usersTable, invoicesTable, salaryTablesTable, salaryPaymentsTable } from "@workspace/db";
import { eq, or, like, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

type InvoiceStatus = "unpaid" | "partial" | "paid" | "debt" | "cancelled";

interface UnifiedInvoice {
  id: string;
  invoiceId: string;
  title: string;
  code: string | null;
  settleCode: string | null;
  label: string | null;
  type: string;
  category: string | null;
  amount: string;
  paidAmount: string | null;
  remainingAmount: string | null;
  status: InvoiceStatus;
  dueDate: string | null;
  paidAt: string | null;
  paymentMethod: string | null;
  note: string | null;
  createdAt: string;
  isSchedule: boolean;
  salaryTable: {
    id: string;
    name: string;
    startDate: string | null;
    endDate: string | null;
    locationName: string | null;
  } | null;
  _createdAtDate: Date;
}

// 13.1 Danh sách phiếu chi lương
router.get("/mobile/staff/invoices", requireAuth, async (req, res) => {
  const staffId = req.session.userId as string;
  try {
    const [staff] = await db
      .select({ id: usersTable.id, name: usersTable.name, username: usersTable.username })
      .from(usersTable)
      .where(eq(usersTable.id, staffId))
      .limit(1);

    if (!staff) return res.status(404).json({ message: "Không tìm thấy nhân viên" });

    const staffCode = staff.username;

    // Source 1: invoices directly tagged with the staff code in subjectName
    const directInvoices = await db
      .select()
      .from(invoicesTable)
      .where(
        or(
          like(invoicesTable.subjectName, `${staffCode}%`),
          like(invoicesTable.subjectName, `${staffCode} -%`),
        ),
      );

    // Source 2: payments from salary tables published for this staff member
    const salaryPayments = await db
      .select({
        payment: salaryPaymentsTable,
        salaryTable: salaryTablesTable,
      })
      .from(salaryPaymentsTable)
      .innerJoin(salaryTablesTable, eq(salaryPaymentsTable.salaryTableId, salaryTablesTable.id))
      .where(sql`${salaryPaymentsTable.staffId} = ${staffId} AND ${salaryTablesTable.published} = true`);

    const fromInvoices: UnifiedInvoice[] = directInvoices.map((inv) => ({
      id: inv.id,
      invoiceId: inv.id,
      title: inv.title,
      code: inv.code,
      settleCode: inv.settleCode,
      label: inv.label,
      type: inv.type,
      category: inv.category,
      amount: inv.amount,
      paidAmount: inv.paidAmount,
      remainingAmount: inv.remainingAmount,
      status: inv.status as InvoiceStatus,
      dueDate: inv.dueDate ? inv.dueDate.toISOString() : null,
      paidAt: null,
      paymentMethod: inv.paymentMethod,
      note: inv.note,
      createdAt: inv.createdAt.toISOString(),
      isSchedule: false,
      salaryTable: null,
      _createdAtDate: inv.createdAt,
    }));

    const fromSchedules: UnifiedInvoice[] = salaryPayments.map(({ payment, salaryTable }) => ({
      id: payment.id,
      invoiceId: payment.id,
      title: salaryTable.name,
      code: null,
      settleCode: null,
      label: payment.label,
      type: "Chi",
      category: null,
      amount: payment.amount,
      paidAmount: null,
      remainingAmount: null,
      status: payment.status as InvoiceStatus,
      dueDate: null,
      paidAt: payment.paidAt ? payment.paidAt.toISOString() : null,
      paymentMethod: payment.paymentMethod,
      note: payment.note,
      createdAt: payment.createdAt.toISOString(),
      isSchedule: true,
      salaryTable: {
        id: salaryTable.id,
        name: salaryTable.name,
        startDate: salaryTable.startDate,
        endDate: salaryTable.endDate,
        locationName: salaryTable.locationName,
      },
      _createdAtDate: payment.createdAt,
    }));

    let merged = [...fromInvoices, ...fromSchedules];

    const statusFilter = typeof req.query.status === "string" ? req.query.status : null;
    if (statusFilter) {
      merged = merged.filter((m) => m.status === statusFilter);
    }

    merged.sort((a, b) => b._createdAtDate.getTime() - a._createdAtDate.getTime());

    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const total = merged.length;
    const totalPages = Math.max(Math.ceil(total / limit), 1);
    const start = (page - 1) * limit;
    const pageItems = merged.slice(start, start + limit).map(({ _createdAtDate, ...rest }) => rest);

    let totalPaid = 0;
    let totalUnpaid = 0;
    let totalAmount = 0;
    for (const m of merged) {
      const amt = Number(m.amount) || 0;
      totalAmount += amt;
      if (m.status === "paid") totalPaid += amt;
      else if (m.status !== "cancelled") totalUnpaid += amt;
    }

    return res.json({
      invoices: pageItems,
      summary: { totalPaid, totalUnpaid, totalAmount },
      pagination: { page, limit, total, totalPages },
      staff: { id: staff.id, fullName: staff.name ?? staff.username, code: staff.username },
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

export default router;
