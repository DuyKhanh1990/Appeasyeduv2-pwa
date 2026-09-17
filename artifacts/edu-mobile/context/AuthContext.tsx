import React, { createContext, useContext, useEffect, useState } from "react";

import {
  apiGet,
  apiPost,
  clearSession,
  getCenterUrl,
  getStoredProfileDisplayData,
  getStoredRole,
  initApi,
  saveLastCredentials,
  saveProfileDisplayData,
  saveRole,
  setCenterUrl,
  setAuthToken,
  setUnauthorizedHandler,
  sendPushTokenToBackend,
  unregisterPushToken,
} from "@/lib/api";
import { registerForPushNotificationsAsync } from "@/lib/pushNotifications";

export type UserRole = "student" | "teacher" | "staff" | "admin" | "parent";

export interface AuthUser {
  id: string;
  username: string;
  name?: string;
  centerUrl: string;
  role: UserRole;
  profileCode?: string;
  profileId?: string;
}

export interface MobilePermissions {
  isSuperAdmin: boolean;
  userType: string;
  features: {
    dashboard:        { canView: boolean; tabs: { customers: boolean; training: boolean; finance: boolean } };
    newsFeed:         { canView: boolean; canViewAll: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean };
    customers:        { canView: boolean; canViewAll: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean };
    classes:          { canView: boolean; canViewAll: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean };
    invoices:         { canView: boolean; canViewAll: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean };
    tasks:            { canView: boolean; canViewAll: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean };
    learningOverview: { canView: boolean; canViewAll: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean };
    salary:           { canView: boolean; canViewAll: boolean };
    grades:           { canView: boolean; canViewAll: boolean; canEdit: boolean };
    mySpace: {
      calendar:    { canView: boolean };
      assignments: { canView: boolean };
      scoreSheet:  { canView: boolean };
      invoices:    { canView: boolean };
      payroll:     { canView: boolean };
    };
  };
}

interface MobileAuthResponse {
  token?: string;
  user: {
    id: string | number;
    username: string;
    isActive?: boolean;
    name?: string;
    fullName?: string;
    displayName?: string;
    role?: string;
  };
  userType?: "student" | "staff" | "parent" | null;
  profile?: {
    id?: string | number;
    fullName?: string;
    name?: string;
    displayName?: string;
    code?: string;
    type?: string;
  };
  // Legacy fields
  studentId?: string;
  staffId?: string;
  staffName?: string;
  staffCode?: string;
}

function getDisplayName(data: MobileAuthResponse, preferredName?: string): string | undefined {
  const identityCodes = new Set(
    [
      data.profile?.code,
      data.staffCode,
      data.user.username,
    ]
      .map((value) => value?.trim().toLowerCase())
      .filter(Boolean),
  );
  const candidates = [
    preferredName,
    data.profile?.fullName,
    data.profile?.displayName,
    data.profile?.name,
    data.staffName,
    data.user.fullName,
    data.user.displayName,
    data.user.name,
  ];

  return candidates.find((candidate) => {
    const value = candidate?.trim();
    return Boolean(value) && !identityCodes.has(value.toLowerCase());
  });
}

interface AuthContextType {
  user: AuthUser | null;
  permissions: MobilePermissions | null;
  isLoading: boolean;
  login: (centerUrl: string, username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setUserRole: (role: UserRole) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

function resolveRole(data: MobileAuthResponse): UserRole {
  // Format mới: userType trực tiếp
  if (data.userType === "student") return "student";
  if (data.userType === "parent") return "parent";

  if (data.userType === "staff") {
    const code = (data.profile?.code ?? data.staffCode ?? data.user.username).toUpperCase();
    if (code.startsWith("GV") || code.startsWith("GIAOVIEN") || code.startsWith("TEACHER")) {
      return "teacher";
    }
    if (code.startsWith("QL") || code.startsWith("ADMIN") || code.startsWith("QUANLY")) {
      return "admin";
    }
    return "staff";
  }

  // Format cũ: role trong user object
  if (data.user.role) {
    const r = data.user.role.toLowerCase();
    if (r === "student") return "student";
    if (r === "teacher") return "teacher";
    if (r === "admin") return "admin";
    if (r === "staff") return "staff";
    if (r === "parent") return "parent";
  }

  return "student";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [permissions, setPermissions] = useState<MobilePermissions | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Khi nhận 401 từ bất kỳ API nào → tự động logout
    setUnauthorizedHandler(() => {
      clearSession();
      setUser(null);
      setPermissions(null);
    });
    restoreSession();
  }, []);

  async function fetchPermissions() {
    try {
      const perms = await apiGet<MobilePermissions>("/api/mobile/me/permissions");
      setPermissions(perms);
    } catch {
      // Bỏ qua nếu server chưa hỗ trợ endpoint — mobile tự fallback sang role-based check
    }
  }

  async function restoreSession() {
    try {
      await initApi();
      const storedProfile = await getStoredProfileDisplayData();
      const storedCenter = getCenterUrl();
      if (!storedCenter) {
        setIsLoading(false);
        return;
      }

      let role: UserRole;
      let userData: { id: string; username: string; name?: string };
      let profileCode: string | undefined;
      let profileId: string | undefined;

      try {
        const me = await apiGet<MobileAuthResponse>("/api/mobile/auth/me");
        role = resolveRole(me);
        userData = {
          id: String(me.user.id),
          username: me.user.username,
          name: getDisplayName(me, storedProfile.name),
        };
        profileCode = me.profile?.code ?? me.staffCode ?? (storedProfile.code || me.user.username);
        profileId = me.profile?.id ? String(me.profile.id) : (me.studentId ?? me.staffId);
      } catch {
        const storedRole = await getStoredRole();
        if (storedRole) {
          role = storedRole as UserRole;
          const legacyMe = await apiGet<{ id: string; username: string; name?: string; role?: string }>("/api/auth/me");
          userData = {
            ...legacyMe,
            name: legacyMe.name?.trim().toLowerCase() === legacyMe.username.trim().toLowerCase()
              ? (storedProfile.name || undefined)
              : legacyMe.name,
          };
          profileCode = storedProfile.code || legacyMe.username;
        } else {
          throw new Error("No session");
        }
      }

      await saveRole(role);
      await saveProfileDisplayData(userData.name, profileCode ?? userData.username);
      setUser({ ...userData, role, centerUrl: storedCenter, profileCode, profileId });
      fetchPermissions();

      // Đăng ký lại push token khi khôi phục phiên — token có thể đã thay đổi
      // kể từ lần đăng nhập trước (OS reset token, cập nhật app...).
      registerForPushNotificationsAsync().then(({ token }) => {
        if (token) sendPushTokenToBackend(token);
      });
    } catch {
      clearSession();
    } finally {
      setIsLoading(false);
    }
  }

  async function login(centerUrlInput: string, username: string, password: string) {
    setCenterUrl(centerUrlInput);
    const normalizedCenter = centerUrlInput.trim().replace(/\/$/, "");

    let role: UserRole;
    let userData: { id: string; username: string; name?: string };
    let profileCode: string | undefined;
    let profileId: string | undefined;

    try {
      const { data } = await apiPost<MobileAuthResponse>("/api/mobile/auth/login", {
        username,
        password,
      });
      if (data.token) {
        setAuthToken(data.token);
      }
      role = resolveRole(data);
      userData = {
        id: String(data.user.id),
        username: data.user.username,
        name: getDisplayName(data),
      };
      profileCode = data.profile?.code ?? data.staffCode;
      profileId = data.profile?.id ? String(data.profile.id) : (data.studentId ?? data.staffId);
    } catch {
      // Fallback sang /api/auth/login khi server không hỗ trợ mobile endpoint
      const { data: legacyRaw } = await apiPost<
        | { id: string | number; username: string; name?: string; role?: string }
        | { user: { id: string | number; username: string; name?: string; role?: string } }
      >("/api/auth/login", { username, password });

      const raw =
        "user" in legacyRaw && legacyRaw.user
          ? legacyRaw.user
          : (legacyRaw as { id: string | number; username: string; name?: string; role?: string });

      role = (raw.role as UserRole | undefined) ?? "student";
      userData = { ...raw, id: String(raw.id) };
    }

    await saveLastCredentials(normalizedCenter, username);
    await saveRole(role);
    await saveProfileDisplayData(userData.name, profileCode ?? userData.username);
    setUser({ ...userData, role, centerUrl: normalizedCenter, profileCode, profileId });
    fetchPermissions();

    // Đăng ký push token sau login — fire & forget, không block luồng login.
    // Nếu backend chưa có endpoint hoặc thiết bị chưa cấp quyền thì chỉ log lỗi.
    registerForPushNotificationsAsync().then(({ token }) => {
      if (token) sendPushTokenToBackend(token);
    });
  }

  async function setUserRole(role: UserRole) {
    if (!user) return;
    await saveRole(role);
    setUser({ ...user, role });
  }

  async function logout() {
    try {
      await apiPost("/api/auth/logout", {});
    } catch {}
    // Hủy push token trước khi xóa session — bỏ qua lỗi nếu backend chưa có endpoint.
    await unregisterPushToken();
    clearSession();
    setUser(null);
    setPermissions(null);
  }

  return (
    <AuthContext.Provider value={{ user, permissions, isLoading, login, logout, setUserRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
