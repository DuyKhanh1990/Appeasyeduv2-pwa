import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

type UserRole = "student" | "teacher" | "staff" | "admin" | "parent";

function buildPermissions(role: UserRole) {
  const isAdmin    = role === "admin";
  const isStaff    = role === "staff" || role === "teacher" || role === "admin";
  const isTeacher  = role === "teacher";

  return {
    isSuperAdmin: isAdmin,
    userType: role === "student" ? "student" : role === "parent" ? "parent" : "staff",
    features: {
      dashboard: {
        canView: isAdmin,
        tabs: {
          customers: isAdmin,
          training:  isAdmin,
          finance:   isAdmin,
        },
      },
      newsFeed: {
        canView:   isStaff,
        canCreate: isStaff,
        canEdit:   isStaff,
        canDelete: isAdmin,
      },
      customers: {
        canView:    isStaff,
        canViewAll: isAdmin,
        canCreate:  isAdmin,
        canEdit:    isAdmin,
        canDelete:  isAdmin,
      },
      classes: {
        canView:    isStaff,
        canViewAll: isAdmin,
        canCreate:  isAdmin,
        canEdit:    isAdmin || isTeacher,
        canDelete:  isAdmin,
      },
      invoices: {
        canView:    isStaff,
        canViewAll: isAdmin,
        canCreate:  isAdmin,
        canEdit:    isAdmin,
        canDelete:  isAdmin,
      },
      tasks: {
        canView:    isStaff,
        canViewAll: isAdmin,
        canCreate:  isStaff,
        canEdit:    isStaff,
        canDelete:  isAdmin,
      },
      learningOverview: {
        canView:    isAdmin,
        canViewAll: isAdmin,
      },
      salary: {
        canView:    isStaff,
        canViewAll: isAdmin,
      },
      grades: {
        canView:    isStaff,
        canViewAll: isAdmin,
        canEdit:    isAdmin || isTeacher,
      },
    },
  };
}

/**
 * GET /api/mobile/me/permissions
 * Trả về toàn bộ flags phân quyền theo tính năng.
 */
router.get("/mobile/me/permissions", requireAuth, async (req, res) => {
  try {
    const [user] = await db
      .select({ id: usersTable.id, role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.id, req.session.userId as string))
      .limit(1);

    if (!user) return res.status(401).json({ message: "Chưa đăng nhập" });

    return res.json(buildPermissions(user.role as UserRole));
  } catch {
    return res.status(500).json({ message: "Lỗi server" });
  }
});

/**
 * GET /api/mobile/me/profile
 * Thông tin cá nhân đầy đủ kèm danh sách roles + cơ sở.
 */
router.get("/mobile/me/profile", requireAuth, async (req, res) => {
  try {
    const [user] = await db
      .select({ id: usersTable.id, username: usersTable.username, name: usersTable.name, role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.id, req.session.userId as string))
      .limit(1);

    if (!user) return res.status(401).json({ message: "Chưa đăng nhập" });

    const role = user.role as UserRole;
    const userType = role === "student" ? "student" : role === "parent" ? "parent" : "staff";
    const isAdmin = role === "admin";

    const ROLE_LABELS: Record<UserRole, string> = {
      admin:   "Quản lý",
      teacher: "Giáo viên",
      staff:   "Nhân viên",
      student: "Học viên",
      parent:  "Phụ huynh",
    };

    return res.json({
      id:          user.id,
      username:    user.username,
      userType,
      isSuperAdmin: isAdmin,
      profile: {
        fullName:  user.name ?? user.username,
        code:      user.username.toUpperCase(),
        email:     null,
        avatarUrl: null,
      },
      roles: [
        { id: role, name: ROLE_LABELS[role] ?? role, description: null },
      ],
      // Không có bảng locations trong DB hiện tại
      locations: [],
    });
  } catch {
    return res.status(500).json({ message: "Lỗi server" });
  }
});

export default router;
