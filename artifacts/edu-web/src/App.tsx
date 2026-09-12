import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ArrowLeft, ArrowRight, Bell, BookOpen, CalendarDays, Check, ChevronRight, CircleAlert,
  CircleCheck, CreditCard, FileText, GraduationCap, Home, Inbox, Info, KeyRound,
  LayoutGrid, Link as LinkIcon, LogOut, Menu, Settings as SettingsIcon,
  ShieldCheck, Smartphone, Sparkles, UserRound, UsersRound, WalletCards, WifiOff, X,
} from "lucide-react";
import { Link, Route, Switch, Router as WouterRouter, useLocation } from "wouter";
import { ErrorBoundary } from "@/components/error-boundary";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();
type Role = "student" | "teacher" | "staff" | "admin" | "parent";
type User = { id: string; username: string; name?: string; role: Role; centerUrl: string; profileCode?: string; profileId?: string };
type ApiError = Error & { status?: number };
type Session = { id?: string; classSessionId?: string; className?: string; classCode?: string; date?: string; sessionDate?: string; startTime?: string; endTime?: string; locationName?: string; learningFormat?: string; sessionStatus?: string; status?: string; attendanceStatus?: string; teacherNames?: string[]; teacherName?: string; sessionIndex?: number };
type EduNotification = { id: string; title: string; content?: string; category?: string; isRead?: boolean; createdAt?: string; referenceId?: string | null };

const roleLabels: Record<Role, string> = { student: "Học viên", teacher: "Giáo viên", staff: "Nhân viên", admin: "Quản lý", parent: "Phụ huynh" };
const navItems = [
  { href: "/", label: "Tổng quan", icon: Home },
  { href: "/schedule", label: "Lịch học", icon: CalendarDays },
  { href: "/classes", label: "Lớp học", icon: BookOpen },
  { href: "/attendance", label: "Điểm danh", icon: CircleCheck },
  { href: "/grades", label: "Kết quả", icon: FileText },
  { href: "/tuition", label: "Học phí", icon: WalletCards },
];

function centerUrl() {
  return localStorage.getItem("edu_center_url") || window.location.origin;
}
function token() {
  return localStorage.getItem("edu_auth_token");
}
async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const authToken = token();
  if (authToken) headers.set("Authorization", `Bearer ${authToken}`);
  const response = await fetch(`${centerUrl()}${path}`, { ...init, headers, credentials: "include" });
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try { const body = await response.json(); if (body?.message) message = body.message; } catch { /* non-json error */ }
    throw Object.assign(new Error(message), { status: response.status }) as ApiError;
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function useRemote<T>(path: string, enabled = true) {
  const [data, setData] = useState<T | undefined>();
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<ApiError | undefined>();
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!enabled) { setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true); setError(undefined);
    api<T>(path, { signal: controller.signal }).then(setData).catch((e: ApiError) => {
      if (e.name !== "AbortError") setError(e);
    }).finally(() => setLoading(false));
    return () => controller.abort();
  }, [path, enabled, version]);
  return { data, loading, error, reload: useCallback(() => setVersion((v) => v + 1), []) };
}

function useAuthState() {
  const [user, setUser] = useState<User | null>(null);
  const [permissions, setPermissions] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const savedUrl = localStorage.getItem("edu_center_url");
    if (!savedUrl && !token()) { setLoading(false); return; }
    api<any>("/api/mobile/auth/me").then((data) => {
      const resolved = resolveUser(data, savedUrl || centerUrl());
      setUser(resolved);
      api<any>("/api/mobile/me/permissions").then(setPermissions).catch(() => setPermissions(null));
    }).catch(() => {
      localStorage.removeItem("edu_auth_token");
      setUser(null);
    }).finally(() => setLoading(false));
  }, []);
  const login = async (url: string, username: string, password: string) => {
    const normalized = url.trim().replace(/\/$/, "");
    if (!normalized) throw new Error("Vui lòng nhập URL trung tâm");
    localStorage.setItem("edu_center_url", normalized);
    let response: any;
    try {
      response = await api<any>("/api/mobile/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
    } catch {
      response = await api<any>("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
    }
    if (response?.token) localStorage.setItem("edu_auth_token", response.token);
    const me = response?.user ? response : await api<any>("/api/mobile/auth/me");
    const next = resolveUser(me, normalized);
    localStorage.setItem("edu_user_role", next.role);
    localStorage.setItem("edu_last_username", username);
    setUser(next);
    api<any>("/api/mobile/me/permissions").then(setPermissions).catch(() => setPermissions(null));
  };
  const logout = async () => {
    try { await api("/api/auth/logout", { method: "POST", body: "{}" }); } catch { /* clear locally even when server is offline */ }
    localStorage.removeItem("edu_auth_token");
    localStorage.removeItem("edu_user_role");
    setUser(null);
    setPermissions(null);
  };
  return { user, permissions, loading, login, logout };
}
function resolveRole(data: any): Role {
  if (data?.userType === "student") return "student";
  if (data?.userType === "parent") return "parent";
  const raw = String(data?.userType === "staff" ? data?.profile?.code || data?.staffCode || data?.user?.username : data?.user?.role || data?.role || "student").toLowerCase();
  if (raw.includes("teacher") || raw.startsWith("gv") || raw.includes("giaovien")) return "teacher";
  if (raw.includes("admin") || raw.startsWith("ql") || raw.includes("quanly")) return "admin";
  if (raw === "staff" || data?.userType === "staff") return "staff";
  return raw === "parent" ? "parent" : "student";
}
function resolveUser(data: any, url: string): User {
  const raw = data?.user || data;
  return {
    id: String(raw?.id || "unknown"), username: raw?.username || "",
    name: data?.profile?.fullName || data?.name || raw?.name,
    role: resolveRole(data), centerUrl: url,
    profileCode: data?.profile?.code || data?.staffCode,
    profileId: data?.profile?.id ? String(data.profile.id) : data?.studentId || data?.staffId,
  };
}

function Avatar({ user, small = false }: { user: User; small?: boolean }) {
  const initials = (user.name || user.username || "E").split(/\s+/).slice(-2).map((s) => s[0]).join("").toUpperCase();
  return <div data-testid="avatar-user" className={`flex shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--accent))] font-extrabold text-[hsl(var(--foreground))] ${small ? "h-8 w-8 text-[10px]" : "h-10 w-10 text-xs"}`}>{initials}</div>;
}
function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "warn" | "bad" | "teal" }) {
  const colors = { neutral: "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]", good: "bg-[#dcefe7] text-[#23634f]", warn: "bg-[#fff0d0] text-[#8d5e18]", bad: "bg-[#f8dfdc] text-[#a7443a]", teal: "bg-[#d7ebe9] text-[#2e6762]" };
  return <span className={`inline-flex items-center rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-[.08em] ${colors[tone]}`}>{children}</span>;
}
function statusTone(status?: string): "neutral" | "good" | "warn" | "bad" | "teal" {
  const s = String(status || "").toLowerCase();
  if (["present", "attended", "paid", "published", "completed"].some((v) => s.includes(v))) return "good";
  if (["late", "partial", "pending", "scheduled"].some((v) => s.includes(v))) return "warn";
  if (["absent", "unpaid", "cancelled", "debt"].some((v) => s.includes(v))) return "bad";
  return "teal";
}
function statusLabel(status?: string) {
  const labels: Record<string, string> = { present: "Có mặt", attended: "Đã học", late: "Đi muộn", absent: "Vắng", pending: "Chờ cập nhật", scheduled: "Sắp diễn ra", completed: "Đã hoàn thành", paid: "Đã thanh toán", unpaid: "Chưa thanh toán", partial: "Thanh toán một phần", debt: "Còn công nợ", cancelled: "Đã hủy" };
  return labels[String(status || "").toLowerCase()] || status || "Chưa xác định";
}
function formatDate(value?: string, compact = false) {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return new Intl.DateTimeFormat("vi-VN", compact ? { day: "2-digit", month: "2-digit" } : { weekday: "long", day: "2-digit", month: "long" }).format(date);
}
function monthValue(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; }
function LoadingRows({ count = 4 }: { count?: number }) {
  return <div className="space-y-3" data-testid="loading-skeleton">{Array.from({ length: count }, (_, i) => <div className="skeleton h-[72px] rounded-2xl" key={i} />)}</div>;
}
function ErrorState({ message = "Không thể tải dữ liệu lúc này.", onRetry }: { message?: string; onRetry?: () => void }) {
  return <div data-testid="state-error" className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card))] px-6 py-12 text-center"><WifiOff className="mb-3 h-7 w-7 text-[hsl(var(--accent))]" /><p className="font-semibold">{message}</p><p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">Kiểm tra kết nối trung tâm rồi thử lại.</p>{onRetry && <button data-testid="button-retry" onClick={onRetry} className="button-primary mt-5 rounded-xl px-4 py-2 text-sm font-bold">Thử lại</button>}</div>;
}
function EmptyState({ title, detail, icon: Icon = Inbox }: { title: string; detail: string; icon?: typeof Inbox }) {
  return <div data-testid="state-empty" className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card))] px-6 py-12 text-center"><Icon className="mb-3 h-8 w-8 text-[hsl(var(--primary))]" /><p className="font-bold">{title}</p><p className="mt-1 max-w-sm text-sm text-[hsl(var(--muted-foreground))]">{detail}</p></div>;
}
function PageTitle({ eyebrow, title, detail, action }: { eyebrow: string; title: string; detail?: string; action?: ReactNode }) {
  return <header className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="mono mb-2 text-[10px] font-medium uppercase tracking-[.2em] text-[hsl(var(--primary))]">{eyebrow}</p><h1 data-testid="text-page-title" className="display text-4xl font-semibold leading-none sm:text-5xl">{title}</h1>{detail && <p className="mt-3 max-w-2xl text-sm text-[hsl(var(--muted-foreground))]">{detail}</p>}</div>{action}</header>;
}

function Layout({ children, auth }: { children: ReactNode; auth: ReturnType<typeof useAuthState> }) {
  const [location, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const user = auth.user;
  useEffect(() => { if (!auth.loading && !user && location !== "/login") setLocation("/login"); }, [auth.loading, user, location, setLocation]);
  const unreadPath = user && ["teacher", "staff", "admin"].includes(user.role) ? "/api/mobile/staff/notifications/unread-count" : user?.role === "parent" ? "/api/mobile/parent/notifications/unread-count" : "/api/mobile/student/notifications/unread-count";
  const unread = useRemote<{ total?: number }>("/api/mobile/student/notifications/unread-count", !!user && !unreadPath);
  const unreadStaff = useRemote<{ total?: number }>(unreadPath || "/api/mobile/student/notifications/unread-count", !!user);
  const count = unreadPath ? unreadStaff.data?.total : unread.data?.total;
  if (!user) {
    return null;
  }
  return <div className="grain app-shell bg-[hsl(var(--background))]">
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[254px] flex-col border-r border-[hsl(var(--border))] bg-[hsl(var(--card))] px-5 py-6 lg:flex">
      <Link href="/" data-testid="link-brand" className="mb-12 flex items-center gap-3 px-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"><GraduationCap className="h-5 w-5" /></div>
        <div><div className="display text-xl font-bold">EasyEdu</div><div className="mono text-[9px] uppercase tracking-[.16em] text-[hsl(var(--muted-foreground))]">workspace</div></div>
      </Link>
      <div className="mono mb-3 px-3 text-[9px] uppercase tracking-[.2em] text-[hsl(var(--muted-foreground))]">Không gian học tập</div>
      <nav className="space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => <Link key={href} href={href} data-testid={`link-nav-${label}`} className={`nav-link flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold ${location === href ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]" : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"}`}><Icon className="h-[18px] w-[18px]" />{label}</Link>)}
      </nav>
      <div className="mt-auto space-y-1">
        <Link href="/notifications" data-testid="link-nav-notifications" className={`nav-link flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold ${location === "/notifications" ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]" : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]"}`}><Bell className="h-[18px] w-[18px]" />Thông báo{Boolean(count) && <span className="ml-auto rounded-full bg-[hsl(var(--accent))] px-1.5 text-[10px] text-[hsl(var(--foreground))]">{count}</span>}</Link>
        <Link href="/settings" data-testid="link-nav-settings" className="nav-link flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]"><SettingsIcon className="h-[18px] w-[18px]" />Cài đặt</Link>
      </div>
      <div className="mt-5 border-t border-[hsl(var(--border))] pt-4"><div className="flex items-center gap-3"><Avatar user={user} small /><div className="min-w-0"><div data-testid="text-sidebar-username" className="truncate text-xs font-bold">{user.name || user.username}</div><div className="text-[10px] text-[hsl(var(--muted-foreground))]">{roleLabels[user.role]}</div></div></div></div>
    </aside>
    <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]/95 px-5 backdrop-blur lg:hidden">
      <Link href="/" data-testid="link-mobile-brand" className="flex items-center gap-2"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"><GraduationCap className="h-5 w-5" /></div><span className="display text-xl font-bold">EasyEdu</span></Link>
      <div className="flex items-center gap-2"><Link href="/notifications" data-testid="link-mobile-notifications" className="relative rounded-xl p-2 hover:bg-[hsl(var(--muted))]"><Bell className="h-5 w-5" />{Boolean(count) && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-[hsl(var(--accent))]" />}</Link><button data-testid="button-mobile-menu" onClick={() => setMobileOpen(!mobileOpen)} className="rounded-xl p-2 hover:bg-[hsl(var(--muted))]"><Menu className="h-5 w-5" /></button></div>
    </header>
    {mobileOpen && <div className="fixed inset-x-0 top-[72px] z-20 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 shadow-md lg:hidden">{[...navItems, { href: "/settings", label: "Cài đặt", icon: SettingsIcon }].map(({ href, label, icon: Icon }) => <Link onClick={() => setMobileOpen(false)} key={href} href={href} data-testid={`link-mobile-${label}`} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold hover:bg-[hsl(var(--muted))]"><Icon className="h-4 w-4" />{label}</Link>)}</div>}
    <main className="pb-24 lg:ml-[254px] lg:pb-8"><div className="mx-auto max-w-[1440px] px-5 py-7 sm:px-8 lg:px-12 lg:py-10">{children}</div></main>
    <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-[hsl(var(--border))] bg-[hsl(var(--card))]/95 px-2 py-2 backdrop-blur lg:hidden">{navItems.slice(0, 4).map(({ href, label, icon: Icon }) => <Link href={href} key={href} data-testid={`link-bottom-${label}`} className={`flex flex-col items-center gap-1 rounded-lg py-1 text-[10px] font-bold ${location === href ? "text-[hsl(var(--primary))]" : "text-[hsl(var(--muted-foreground))]"}`}><Icon className="h-5 w-5" />{label}</Link>)}</nav>
  </div>;
}

function Protected({ auth, children }: { auth: ReturnType<typeof useAuthState>; children: ReactNode }) {
  if (auth.loading) return <div className="flex min-h-[100dvh] items-center justify-center bg-[hsl(var(--background))]"><div className="w-64 space-y-3"><div className="skeleton h-12 rounded-2xl" /><div className="skeleton h-5 rounded-lg" /><div className="skeleton h-5 rounded-lg" /></div></div>;
  return <Layout auth={auth}>{children}</Layout>;
}

function Overview({ auth }: { auth: ReturnType<typeof useAuthState> }) {
  const user = auth.user;
  const today = useRemote<{ date?: string; sessions?: Session[] }>("/api/mobile/schedule/today");
  const notifPath = user && ["teacher", "staff", "admin"].includes(user.role) ? "/api/mobile/staff/notifications?limit=4" : user?.role === "parent" ? "/api/mobile/parent/notifications?limit=4" : "/api/mobile/student/notifications?limit=4";
  const notices = useRemote<{ items?: EduNotification[]; totalUnread?: number }>(notifPath, !!user);
  const overview = useRemote<{ studentsEndingSoon?: number; classesEndingSoon?: number }>("/api/mobile/learning-overview/summary");
  const sessions = today.data?.sessions || [];
  if (!user) return <Protected auth={auth}>{null}</Protected>;
  return <Protected auth={auth}><PageTitle eyebrow="Thứ hai, 14 tháng 10" title={`Chào ${user.name?.split(" ").slice(-1)[0] || "bạn"}.`} detail="Mọi điều quan trọng cho việc học, ở đúng nơi bạn cần tìm." action={<Link href="/schedule" data-testid="link-open-schedule" className="button-primary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold">Xem lịch đầy đủ <ArrowRight className="h-4 w-4" /></Link>} />
    <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
      <section className="panel rise rounded-[24px] bg-[hsl(var(--primary))] p-6 text-[hsl(var(--primary-foreground))] sm:p-8"><div className="flex items-start justify-between"><div><p className="mono text-[10px] uppercase tracking-[.18em] opacity-70">Hôm nay</p><h2 data-testid="text-today-date" className="display mt-3 text-3xl font-semibold">{formatDate(today.data?.date || new Date().toISOString())}</h2></div><div className="rounded-2xl bg-[hsl(var(--primary-foreground))]/10 p-3"><CalendarDays className="h-5 w-5" /></div></div><div className="mt-8">{today.loading ? <div className="space-y-3"><div className="skeleton h-16 rounded-2xl opacity-30" /><div className="skeleton h-16 rounded-2xl opacity-30" /></div> : today.error ? <p data-testid="status-today-error" className="text-sm opacity-80">Lịch hôm nay chưa sẵn sàng.</p> : sessions.length === 0 ? <div className="rounded-2xl border border-[hsl(var(--primary-foreground))]/20 bg-[hsl(var(--primary-foreground))]/10 p-5"><Sparkles className="mb-3 h-5 w-5 text-[hsl(var(--accent))]" /><p className="font-bold">Một ngày nhẹ nhàng</p><p className="mt-1 text-sm opacity-75">Bạn không có buổi học nào hôm nay.</p></div> : <div className="space-y-2">{sessions.slice(0, 3).map((s, i) => <Link href={`/schedule?session=${s.id || s.classSessionId}`} key={`${s.id || s.classSessionId}-${i}`} data-testid={`card-today-session-${s.id || i}`} className="flex items-center gap-4 rounded-2xl bg-[hsl(var(--primary-foreground))]/10 p-4 transition hover:bg-[hsl(var(--primary-foreground))]/15"><div className="w-14 shrink-0"><div className="mono text-sm font-medium">{s.startTime || "—"}</div><div className="mt-1 text-[10px] opacity-60">{s.endTime || ""}</div></div><div className="min-w-0 flex-1 border-l border-[hsl(var(--primary-foreground))]/20 pl-4"><p className="truncate text-sm font-bold">{s.className || "Buổi học"}</p><p className="mt-1 truncate text-xs opacity-70">{s.locationName || s.learningFormat || "Lịch học"}</p></div><ChevronRight className="h-4 w-4 opacity-60" /></Link>)}</div>}</div></section>
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-1">
        <Link href="/notifications" data-testid="card-unread-notifications" className="panel rise rise-1 group rounded-[24px] bg-[hsl(var(--card))] p-6 hover:-translate-y-0.5"><div className="flex items-center justify-between"><div className="rounded-xl bg-[#f8dfdc] p-2.5 text-[#a7443a]"><Bell className="h-5 w-5" /></div><ArrowRight className="h-4 w-4 text-[hsl(var(--muted-foreground))] transition group-hover:translate-x-1" /></div><p data-testid="text-unread-count" className="display mt-6 text-4xl font-semibold">{notices.loading ? "…" : notices.data?.totalUnread ?? notices.data?.items?.filter((n) => !n.isRead).length ?? 0}</p><p className="mt-1 text-sm font-semibold">Thông báo chưa đọc</p></Link>
        <div data-testid="card-learning-pulse" className="panel rise rise-2 rounded-[24px] bg-[#dcefe7] p-6 text-[#23634f]"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.1em]"><ShieldCheck className="h-4 w-4" /> Nhịp học tập</div><p className="display mt-5 text-2xl font-semibold">{overview.loading ? "Đang cập nhật" : overview.data?.classesEndingSoon ? `${overview.data.classesEndingSoon} lớp sắp kết thúc` : "Bạn đang đi đúng nhịp"}</p><p className="mt-2 text-sm opacity-75">{overview.data?.studentsEndingSoon ? `${overview.data.studentsEndingSoon} học viên cần lưu ý` : "Dữ liệu được đồng bộ từ trung tâm."}</p></div>
      </div>
    </div>
    <div className="mt-7 grid gap-5 lg:grid-cols-[1.2fr_1fr]">
      <section className="panel rise rise-2 rounded-[24px] bg-[hsl(var(--card))] p-6 sm:p-7"><div className="mb-5 flex items-center justify-between"><div><p className="mono text-[10px] uppercase tracking-[.18em] text-[hsl(var(--primary))]">Truy cập nhanh</p><h2 className="display mt-1 text-2xl font-semibold">Điểm chạm quen thuộc</h2></div><LayoutGrid className="h-5 w-5 text-[hsl(var(--muted-foreground))]" /></div><div className="grid grid-cols-2 gap-3">{[{ href: "/attendance", icon: CircleCheck, label: "Điểm danh", detail: "Theo dõi chuyên cần" }, { href: "/grades", icon: FileText, label: "Kết quả", detail: "Xem bảng điểm" }, { href: "/classes", icon: BookOpen, label: "Lớp học", detail: "Nội dung lớp" }, { href: "/tuition", icon: CreditCard, label: "Học phí", detail: "Hóa đơn & thanh toán" }].map(({ href, icon: Icon, label, detail }) => <Link href={href} key={href} data-testid={`link-quick-${label}`} className="button-quiet rounded-2xl border border-[hsl(var(--border))] p-4"><Icon className="h-5 w-5 text-[hsl(var(--primary))]" /><p className="mt-7 text-sm font-bold">{label}</p><p className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">{detail}</p></Link>)}</div></section>
      <section className="panel rise rise-3 rounded-[24px] bg-[hsl(var(--card))] p-6 sm:p-7"><div className="mb-5 flex items-center justify-between"><div><p className="mono text-[10px] uppercase tracking-[.18em] text-[hsl(var(--primary))]">Mới nhất</p><h2 className="display mt-1 text-2xl font-semibold">Từ trung tâm</h2></div><Link href="/notifications" data-testid="link-view-all-notifications" className="text-xs font-bold text-[hsl(var(--primary))]">Xem tất cả</Link></div>{notices.loading ? <LoadingRows count={3} /> : notices.error ? <p className="text-sm text-[hsl(var(--muted-foreground))]">Chưa tải được thông báo.</p> : notices.data?.items?.length ? <div className="divide-y divide-[hsl(var(--border))]">{notices.data.items.slice(0, 3).map((n) => <Link href="/notifications" key={n.id} data-testid={`row-overview-notification-${n.id}`} className="block py-3 first:pt-0 last:pb-0"><div className="flex gap-3"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.isRead ? "bg-[hsl(var(--border))]" : "bg-[hsl(var(--accent))]"}`} /><div><p className="line-clamp-1 text-sm font-semibold">{n.title}</p><p className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">{n.createdAt ? formatDate(n.createdAt, true) : "Mới cập nhật"}</p></div></div></Link>)}</div> : <EmptyState title="Hộp thư đang yên" detail="Các cập nhật mới từ trung tâm sẽ xuất hiện ở đây." icon={Bell} />}</section>
    </div>
    <InstallPrompt />
  </Protected>;
}

function useMonthNavigation() {
  const [month, setMonth] = useState(monthValue());
  const move = (delta: number) => { const [y, m] = month.split("-").map(Number); const date = new Date(y, m - 1 + delta, 1); setMonth(monthValue(date)); };
  return { month, move };
}
function MonthBar({ month, onMove }: { month: string; onMove: (delta: number) => void }) {
  const [y, m] = month.split("-").map(Number);
  return <div className="flex items-center gap-2"><button data-testid="button-previous-month" onClick={() => onMove(-1)} className="button-quiet rounded-xl p-2"><ArrowLeft className="h-4 w-4" /></button><div data-testid="text-current-month" className="min-w-[130px] text-center text-sm font-bold">{new Intl.DateTimeFormat("vi-VN", { month: "long", year: "numeric" }).format(new Date(y, m - 1, 1))}</div><button data-testid="button-next-month" onClick={() => onMove(1)} className="button-quiet rounded-xl p-2"><ArrowRight className="h-4 w-4" /></button></div>;
}
function Schedule({ auth }: { auth: ReturnType<typeof useAuthState> }) {
  const { month, move } = useMonthNavigation();
  const staff = ["teacher", "staff", "admin"].includes(auth.user?.role || "");
  const data = useRemote<any>(staff ? `/api/mobile/staff/calendar?month=${month}` : `/api/mobile/student/calendar?month=${month}`, !!auth.user);
  const [selected, setSelected] = useState<Session | null>(null);
  const sessions: Session[] = data.data?.sessions || [];
  const grouped = useMemo(() => sessions.reduce<Record<string, Session[]>>((acc, s) => { const key = s.sessionDate || s.date || "unknown"; (acc[key] ||= []).push(s); return acc; }, {}), [sessions]);
  const detail = useRemote<any>(selected ? (staff ? `/api/mobile/staff/calendar/session/${selected.classSessionId || selected.id}` : `/api/mobile/student/session/${selected.classSessionId || selected.id}`) : "/api/mobile/student/session/none", !!selected);
  if (!auth.user) return <Protected auth={auth}>{null}</Protected>;
  return <Protected auth={auth}><PageTitle eyebrow="Lịch trình" title="Lịch học" detail="Một nhịp nhìn rõ ràng cho từng buổi học và những điều cần chuẩn bị." action={<MonthBar month={month} onMove={move} />} /><div className="grid gap-5 xl:grid-cols-[1fr_360px]"><section className="panel rounded-[24px] bg-[hsl(var(--card))] p-5 sm:p-7">{data.loading ? <LoadingRows count={5} /> : data.error ? <ErrorState onRetry={data.reload} /> : Object.keys(grouped).length === 0 ? <EmptyState title="Chưa có buổi học" detail="Tháng này chưa có lịch được ghi nhận." icon={CalendarDays} /> : <div className="space-y-7">{Object.entries(grouped).map(([date, daySessions]) => <div key={date}><div className="mb-3 flex items-baseline gap-3"><span className="display text-2xl font-semibold">{date === new Date().toISOString().slice(0, 10) ? "Hôm nay" : formatDate(date)}</span><span className="mono text-[10px] text-[hsl(var(--muted-foreground))]">{daySessions.length} buổi</span></div><div className="space-y-2">{daySessions.map((s, i) => <button onClick={() => setSelected(s)} key={`${s.id || s.classSessionId}-${i}`} data-testid={`button-session-${s.id || s.classSessionId || i}`} className={`flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${selected?.id === s.id ? "border-[hsl(var(--primary))]" : "border-[hsl(var(--border))]"}`}><div className="w-16 shrink-0"><div className="mono text-sm font-medium">{s.startTime || "—"}</div><div className="mt-1 text-[10px] text-[hsl(var(--muted-foreground))]">{s.endTime || ""}</div></div><div className="min-w-0 flex-1 border-l border-[hsl(var(--border))] pl-4"><p className="truncate text-sm font-bold">{s.className || "Buổi học"}</p><p className="mt-1 truncate text-xs text-[hsl(var(--muted-foreground))]">{s.locationName || s.learningFormat || "Chưa cập nhật địa điểm"}</p></div><Badge tone={statusTone(s.attendanceStatus || s.sessionStatus)}>{statusLabel(s.attendanceStatus || s.sessionStatus)}</Badge><ChevronRight className="hidden h-4 w-4 text-[hsl(var(--muted-foreground))] sm:block" /></button>)}</div></div>)}</div>}</section><aside className="panel h-fit rounded-[24px] bg-[hsl(var(--primary))] p-6 text-[hsl(var(--primary-foreground))] xl:sticky xl:top-8">{!selected ? <div className="flex min-h-[230px] flex-col justify-between"><div><CalendarDays className="h-6 w-6 opacity-75" /><h2 className="display mt-8 text-3xl font-semibold">Chọn một buổi học</h2><p className="mt-2 text-sm opacity-70">Xem chi tiết lớp, giáo viên và trạng thái điểm danh.</p></div><div className="mono text-[10px] uppercase tracking-[.12em] opacity-55">Lịch học của bạn</div></div> : detail.loading ? <div className="space-y-3"><div className="skeleton h-8 w-2/3 rounded-lg opacity-20" /><div className="skeleton h-5 w-1/2 rounded-lg opacity-20" /><div className="skeleton h-24 rounded-2xl opacity-20" /></div> : detail.error ? <p className="text-sm">Không tải được chi tiết buổi học.</p> : <div data-testid="panel-session-detail"><div className="flex items-center justify-between"><Badge tone="teal">{statusLabel(detail.data?.sessionStatus || detail.data?.attendanceStatus || selected.attendanceStatus)}</Badge><button data-testid="button-close-session-detail" onClick={() => setSelected(null)} className="rounded-lg p-1 hover:bg-white/10"><X className="h-4 w-4" /></button></div><h2 className="display mt-7 text-3xl font-semibold">{detail.data?.className || selected.className}</h2><p className="mt-2 text-sm opacity-70">{formatDate(detail.data?.sessionDate || selected.sessionDate)} · Buổi {detail.data?.sessionIndex || selected.sessionIndex || "—"}</p><div className="mt-8 space-y-4 border-t border-white/15 pt-5 text-sm"><div className="flex justify-between"><span className="opacity-60">Thời gian</span><span>{detail.data?.startTime || selected.startTime} – {detail.data?.endTime || selected.endTime}</span></div><div className="flex justify-between"><span className="opacity-60">Địa điểm</span><span>{detail.data?.locationName || selected.locationName || "Chưa cập nhật"}</span></div><div className="flex justify-between"><span className="opacity-60">Hình thức</span><span>{detail.data?.learningFormat || selected.learningFormat || "Trực tiếp"}</span></div></div></div>}</aside></div></Protected>;
}

function Classes({ auth }: { auth: ReturnType<typeof useAuthState> }) {
  const staff = ["teacher", "staff", "admin"].includes(auth.user?.role || "");
  const month = monthValue();
  const data = useRemote<any>(staff ? "/api/mobile/staff/classes" : `/api/mobile/student/calendar?month=${month}`, !!auth.user);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const detail = useRemote<any>(selectedId ? `/api/mobile/staff/classes/${selectedId}/sessions` : "/api/mobile/staff/classes/none/sessions", staff && !!selectedId);
  const classes = useMemo(() => {
    if (staff) return Array.isArray(data.data) ? data.data : data.data?.classes || [];
    const byId = new Map<string, any>();
    (data.data?.sessions || []).forEach((s: any) => { if (s.classId && !byId.has(s.classId)) byId.set(s.classId, { id: s.classId, name: s.className, code: s.classCode }); });
    return [...byId.values()];
  }, [data.data, staff]);
  if (!auth.user) return <Protected auth={auth}>{null}</Protected>;
  return <Protected auth={auth}><PageTitle eyebrow={staff ? "Điều phối" : "Không gian của bạn"} title="Lớp học" detail={staff ? "Các lớp bạn đang phụ trách và những buổi học sắp tới." : "Những lớp học đang đồng hành cùng bạn."} /><div className="grid gap-5 lg:grid-cols-[1fr_360px]"><section>{data.loading ? <LoadingRows count={4} /> : data.error ? <ErrorState onRetry={data.reload} /> : classes.length === 0 ? <EmptyState title="Chưa có lớp học" detail="Khi bạn được ghi danh hoặc phân công, lớp học sẽ xuất hiện ở đây." icon={BookOpen} /> : <div className="grid gap-4 sm:grid-cols-2">{classes.map((item: any, i: number) => <button key={item.id || i} onClick={() => setSelectedId(String(item.id))} data-testid={`card-class-${item.id || i}`} className={`panel group rounded-[24px] bg-[hsl(var(--card))] p-6 text-left transition hover:-translate-y-1 hover:shadow-md ${selectedId === String(item.id) ? "ring-2 ring-[hsl(var(--primary))]" : ""}`}><div className="flex items-start justify-between"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#d7ebe9] text-[hsl(var(--primary))]"><BookOpen className="h-5 w-5" /></div><ChevronRight className="h-4 w-4 text-[hsl(var(--muted-foreground))] transition group-hover:translate-x-1" /></div><p className="mono mt-8 text-[10px] uppercase tracking-[.14em] text-[hsl(var(--primary))]">{item.code || "LỚP HỌC"}</p><h2 className="display mt-2 text-2xl font-semibold">{item.name || item.className || "Lớp chưa đặt tên"}</h2><p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">{item.teacherName || item.teacherNames?.join(", ") || (staff ? "Lớp đang quản lý" : "Lịch học trong tháng")}</p></button>)}</div>}</section><aside className="panel h-fit rounded-[24px] bg-[hsl(var(--card))] p-6 lg:sticky lg:top-8">{!selectedId ? <div className="py-6"><UsersRound className="h-6 w-6 text-[hsl(var(--primary))]" /><h2 className="display mt-6 text-3xl font-semibold">Thông tin lớp</h2><p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">Chọn một lớp để xem các buổi học đã lên lịch.</p></div> : detail.loading ? <LoadingRows count={3} /> : detail.error ? <p className="text-sm text-[hsl(var(--muted-foreground))]">Chi tiết lớp chưa khả dụng cho vai trò này.</p> : <div data-testid="panel-class-detail"><div className="flex items-center justify-between"><p className="mono text-[10px] uppercase tracking-[.14em] text-[hsl(var(--primary))]">Buổi học trong lớp</p><button data-testid="button-close-class-detail" onClick={() => setSelectedId(null)} className="rounded-lg p-1 hover:bg-[hsl(var(--muted))]"><X className="h-4 w-4" /></button></div><div className="mt-5 space-y-2">{(Array.isArray(detail.data) ? detail.data : detail.data?.sessions || []).slice(0, 8).map((s: any, i: number) => <Link href={`/schedule?session=${s.id || s.classSessionId}`} key={s.id || i} data-testid={`row-class-session-${s.id || i}`} className="flex items-center justify-between rounded-xl bg-[hsl(var(--muted))] p-3 text-sm"><span>{formatDate(s.sessionDate || s.date, true)}</span><span className="mono text-xs">{s.startTime || "—"}</span></Link>)}</div></div>}</aside></div></Protected>;
}

function Attendance({ auth }: { auth: ReturnType<typeof useAuthState> }) {
  const { month, move } = useMonthNavigation();
  const staff = ["teacher", "staff", "admin"].includes(auth.user?.role || "");
  const data = useRemote<any>(staff ? `/api/mobile/staff/calendar?month=${month}` : `/api/mobile/student/calendar?month=${month}`, !!auth.user);
  const sessions: Session[] = data.data?.sessions || [];
  const counts = sessions.reduce((acc, s) => { const key = s.attendanceStatus || "pending"; acc[key] = (acc[key] || 0) + 1; return acc; }, {} as Record<string, number>);
  const attended = (counts.present || 0) + (counts.attended || 0);
  const rate = sessions.length ? Math.round(attended / sessions.length * 100) : 0;
  if (!auth.user) return <Protected auth={auth}>{null}</Protected>;
  return <Protected auth={auth}><PageTitle eyebrow="Theo dõi chuyên cần" title="Điểm danh" detail="Một cái nhìn minh bạch về sự hiện diện của bạn trong từng buổi học." action={<MonthBar month={month} onMove={move} />} /><div className="grid gap-5 md:grid-cols-3"><div className="panel rounded-[24px] bg-[hsl(var(--primary))] p-6 text-[hsl(var(--primary-foreground))]"><p className="mono text-[10px] uppercase tracking-[.16em] opacity-70">Tỷ lệ có mặt</p><p data-testid="text-attendance-rate" className="display mt-5 text-6xl font-semibold">{data.loading ? "—" : `${rate}%`}</p><p className="mt-2 text-sm opacity-70">trên {sessions.length} buổi trong tháng</p></div>{[["present", "Có mặt"], ["late", "Đi muộn"]].map(([key, label]) => <div key={key} className="panel rounded-[24px] bg-[hsl(var(--card))] p-6"><p className="text-sm font-bold">{label}</p><p data-testid={`text-attendance-${key}`} className="display mt-5 text-5xl font-semibold">{data.loading ? "—" : counts[key] || 0}</p><p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">buổi học</p></div>)}</div><section className="panel mt-5 rounded-[24px] bg-[hsl(var(--card))] p-6 sm:p-7"><div className="mb-5 flex items-center justify-between"><div><p className="mono text-[10px] uppercase tracking-[.16em] text-[hsl(var(--primary))]">Nhật ký</p><h2 className="display mt-1 text-2xl font-semibold">Từng buổi học</h2></div><Badge tone="teal">{sessions.length} buổi</Badge></div>{data.loading ? <LoadingRows /> : data.error ? <ErrorState onRetry={data.reload} /> : sessions.length === 0 ? <EmptyState title="Chưa có dữ liệu điểm danh" detail="Dữ liệu sẽ được cập nhật sau mỗi buổi học." icon={CircleCheck} /> : <div className="divide-y divide-[hsl(var(--border))]">{sessions.map((s, i) => <div key={`${s.id || s.classSessionId}-${i}`} data-testid={`row-attendance-${s.id || i}`} className="flex flex-wrap items-center gap-3 py-4 first:pt-0"><div className="w-24 shrink-0"><p className="text-sm font-bold">{formatDate(s.sessionDate || s.date, true)}</p><p className="mono mt-1 text-[10px] text-[hsl(var(--muted-foreground))]">{s.startTime || "—"}</p></div><div className="min-w-[180px] flex-1"><p className="text-sm font-semibold">{s.className || "Buổi học"}</p><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{s.locationName || "—"}</p></div><Badge tone={statusTone(s.attendanceStatus)}>{statusLabel(s.attendanceStatus)}</Badge></div>)}</div>}</section></Protected>;
}

function Grades({ auth }: { auth: ReturnType<typeof useAuthState> }) {
  const staff = ["teacher", "staff", "admin"].includes(auth.user?.role || "");
  const data = useRemote<any>(staff ? "/api/mobile/staff/score-sheet" : "/api/mobile/student/score-sheet", !!auth.user);
  const books = Array.isArray(data.data) ? data.data : data.data?.items || data.data?.scoreSheets || [];
  if (!auth.user) return <Protected auth={auth}>{null}</Protected>;
  return <Protected auth={auth}><PageTitle eyebrow="Kết quả học tập" title="Bảng điểm" detail={staff ? "Các bảng điểm bạn đang quản lý." : "Những kết quả đã được trung tâm công bố cho bạn."} /><section className="panel rounded-[24px] bg-[hsl(var(--card))] p-6 sm:p-7">{data.loading ? <LoadingRows count={4} /> : data.error ? <ErrorState message={data.error.status === 403 ? "Tài khoản này chưa có quyền xem bảng điểm." : undefined} onRetry={data.reload} /> : books.length === 0 ? <EmptyState title="Chưa có kết quả được công bố" detail="Khi có bảng điểm mới, bạn sẽ thấy thông tin ở đây." icon={FileText} /> : <div className="space-y-3">{books.map((book: any, i: number) => { const scores = book.scores || []; const nums = scores.map((x: any) => Number(x.score)).filter((x: number) => !Number.isNaN(x)); const avg = nums.length ? (nums.reduce((a: number, b: number) => a + b, 0) / nums.length).toFixed(1) : "—"; return <div key={book.id || i} data-testid={`row-grade-${book.id || i}`} className="flex flex-wrap items-center gap-4 rounded-2xl border border-[hsl(var(--border))] p-4 sm:p-5"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#fff0d0] text-[#8d5e18]"><FileText className="h-5 w-5" /></div><div className="min-w-[180px] flex-1"><p className="text-sm font-bold">{book.title || book.name || "Bảng điểm"}</p><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{book.className || book.classCode || "Kết quả học tập"}{book.sessionDate ? ` · ${formatDate(book.sessionDate, true)}` : ""}</p></div><div className="text-right"><p className="mono text-2xl font-medium">{book.average || book.avg || avg}</p><p className="text-[10px] uppercase tracking-[.1em] text-[hsl(var(--muted-foreground))]">Trung bình</p></div><Badge tone={book.published === false ? "warn" : "good"}>{book.published === false ? "Bản nháp" : "Đã công bố"}</Badge></div>; })}</div>}</section></Protected>;
}

function Tuition({ auth }: { auth: ReturnType<typeof useAuthState> }) {
  const staff = ["teacher", "staff", "admin"].includes(auth.user?.role || "");
  const data = useRemote<any>(staff ? "/api/mobile/staff/invoices" : "/api/mobile/student/invoices", !!auth.user);
  const invoices = data.data?.invoices || (Array.isArray(data.data) ? data.data : []);
  const summary = data.data?.summary;
  const money = (value: any) => `${Number(value || 0).toLocaleString("vi-VN")} đ`;
  if (!auth.user) return <Protected auth={auth}>{null}</Protected>;
  return <Protected auth={auth}><PageTitle eyebrow="Tài chính" title={staff ? "Khoản chi" : "Học phí"} detail="Theo dõi rõ ràng các khoản cần thanh toán và lịch sử giao dịch." /><div className="grid gap-4 sm:grid-cols-3">{[["Tổng cộng", summary?.totalAmount || invoices.reduce((a: number, x: any) => a + Number(x.amount || 0), 0)], ["Đã thanh toán", summary?.totalPaid || invoices.filter((x: any) => x.status === "paid").reduce((a: number, x: any) => a + Number(x.amount || 0), 0)], ["Còn lại", summary?.totalUnpaid || invoices.filter((x: any) => x.status !== "paid").reduce((a: number, x: any) => a + Number(x.amount || 0), 0)]].map(([label, value], i) => <div key={String(label)} className={`panel rounded-[24px] p-6 ${i === 2 ? "bg-[#fff0d0]" : "bg-[hsl(var(--card))]"}`}><p className="text-sm font-bold">{label}</p><p data-testid={`text-tuition-summary-${i}`} className="mono mt-5 text-2xl font-medium">{data.loading ? "—" : money(value)}</p></div>)}</div><section className="panel mt-5 rounded-[24px] bg-[hsl(var(--card))] p-6 sm:p-7"><div className="mb-5 flex items-center justify-between"><div><p className="mono text-[10px] uppercase tracking-[.16em] text-[hsl(var(--primary))]">Danh sách</p><h2 className="display mt-1 text-2xl font-semibold">Phiếu thu & khoản phí</h2></div><CreditCard className="h-5 w-5 text-[hsl(var(--muted-foreground))]" /></div>{data.loading ? <LoadingRows /> : data.error ? <ErrorState message="Trung tâm chưa cung cấp dữ liệu học phí cho tài khoản này." onRetry={data.reload} /> : invoices.length === 0 ? <EmptyState title="Chưa có hóa đơn" detail="Các khoản phải thu sẽ hiển thị sau khi được trung tâm phát hành." icon={CreditCard} /> : <div className="divide-y divide-[hsl(var(--border))]">{invoices.map((inv: any, i: number) => <div key={inv.id || i} data-testid={`row-invoice-${inv.id || i}`} className="flex flex-wrap items-center gap-4 py-4 first:pt-0"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#d7ebe9] text-[hsl(var(--primary))]"><WalletCards className="h-4 w-4" /></div><div className="min-w-[180px] flex-1"><p className="text-sm font-bold">{inv.title || inv.label || "Hóa đơn học phí"}</p><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{inv.code || inv.createdAt ? `Mã ${inv.code || "—"} · ${formatDate(inv.createdAt, true)}` : "Khoản phí từ trung tâm"}</p></div><p className="mono text-sm font-medium">{money(inv.amount)}</p><Badge tone={statusTone(inv.status)}>{statusLabel(inv.status)}</Badge></div>)}</div>}</section></Protected>;
}

function Notifications({ auth }: { auth: ReturnType<typeof useAuthState> }) {
  const staff = ["teacher", "staff", "admin"].includes(auth.user?.role || "");
  const base = staff ? "/api/mobile/staff/notifications" : auth.user?.role === "parent" ? "/api/mobile/parent/notifications" : "/api/mobile/student/notifications";
  const data = useRemote<{ items?: EduNotification[]; totalUnread?: number }>(`${base}?limit=100`, !!auth.user);
  const markRead = async (id: string) => { try { await api(`${base}/${id}/read`, { method: "PATCH" }); data.reload(); } catch { /* visible list remains intact */ } };
  const markAll = async () => { try { await api(`${base}/read-all`, { method: "PATCH" }); data.reload(); } catch { /* server error is non-destructive */ } };
  if (!auth.user) return <Protected auth={auth}>{null}</Protected>;
  return <Protected auth={auth}><PageTitle eyebrow="Cập nhật" title="Thông báo" detail="Những tin nhắn quan trọng từ lớp học và trung tâm." action={<button data-testid="button-mark-all-read" onClick={markAll} disabled={!data.data?.totalUnread} className="button-quiet inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--border))] px-4 py-2.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40"><Check className="h-4 w-4" />Đánh dấu đã đọc</button>} /><section className="panel rounded-[24px] bg-[hsl(var(--card))] p-5 sm:p-7">{data.loading ? <LoadingRows count={6} /> : data.error ? <ErrorState onRetry={data.reload} /> : !data.data?.items?.length ? <EmptyState title="Bạn đã cập nhật hết" detail="Thông báo mới sẽ được sắp xếp ở đây." icon={Bell} /> : <div className="divide-y divide-[hsl(var(--border))]">{data.data.items.map((n) => <button onClick={() => !n.isRead && markRead(n.id)} key={n.id} data-testid={`button-notification-${n.id}`} className={`flex w-full gap-4 py-5 text-left transition first:pt-1 hover:bg-[hsl(var(--muted))]/40 ${n.isRead ? "opacity-65" : ""}`}><div className={`mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${n.isRead ? "bg-[hsl(var(--muted))]" : "bg-[#f8dfdc] text-[#a7443a]"}`}><Bell className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-bold">{n.title}</p>{!n.isRead && <Badge tone="teal">Mới</Badge>}</div><p className="mt-1 max-w-3xl text-sm leading-6 text-[hsl(var(--muted-foreground))]">{n.content || "Bạn có một cập nhật mới từ EasyEdu."}</p><p className="mt-2 mono text-[10px] text-[hsl(var(--muted-foreground))]">{n.createdAt ? formatDate(n.createdAt) : "Vừa xong"}</p></div><ChevronRight className="mt-2 h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" /></button>)}</div>}</section></Protected>;
}

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
function InstallPrompt() {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  useEffect(() => { const handler = (e: Event) => { e.preventDefault(); setEvent(e as InstallEvent); }; window.addEventListener("beforeinstallprompt", handler); return () => window.removeEventListener("beforeinstallprompt", handler); }, []);
  if (!event) return null;
  const install = async () => { await event.prompt(); await event.userChoice; setEvent(null); };
  return <div data-testid="card-install-prompt" className="mt-7 flex flex-col gap-4 rounded-[24px] border border-[#e7b18b] bg-[#fff0e5] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"><div className="flex gap-4"><div className="rounded-2xl bg-[#e7b18b]/40 p-3"><Smartphone className="h-5 w-5 text-[#9a563b]" /></div><div><p className="text-sm font-bold">Mang EasyEdu theo bạn</p><p className="mt-1 text-xs text-[#865a47]">Cài đặt ứng dụng để mở nhanh lịch học mỗi ngày.</p></div></div><button data-testid="button-install-app" onClick={install} className="button-primary rounded-xl px-4 py-2.5 text-sm font-bold">Cài đặt ứng dụng</button></div>;
}

function decodeVapidKey(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

function Settings({ auth }: { auth: ReturnType<typeof useAuthState> }) {
  const user = auth.user;
  const [permission, setPermission] = useState(typeof Notification !== "undefined" ? Notification.permission : "default");
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [pushConfig, setPushConfig] = useState<{ enabled: boolean; publicKey: string | null } | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => { const handler = (e: Event) => { e.preventDefault(); setInstallEvent(e as InstallEvent); }; window.addEventListener("beforeinstallprompt", handler); return () => window.removeEventListener("beforeinstallprompt", handler); }, []);
  useEffect(() => {
    if (!user) return;
    api<{ enabled: boolean; publicKey: string | null }>("/api/mobile/push/config")
      .then(setPushConfig)
      .catch(() => setPushConfig({ enabled: false, publicKey: null }));
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready.then((registration) => registration.pushManager.getSubscription())
        .then((subscription) => setSubscribed(Boolean(subscription)))
        .catch(() => setSubscribed(false));
    }
  }, [user]);
  const requestNotifications = async () => {
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setMessage("Trình duyệt này chưa hỗ trợ thông báo đẩy.");
      return;
    }
    if (!pushConfig?.enabled || !pushConfig.publicKey) {
      setMessage("Trung tâm chưa cấu hình thông báo đẩy. Vui lòng liên hệ quản trị viên.");
      return;
    }
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") {
        setMessage("Quyền thông báo chưa được bật.");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeVapidKey(pushConfig.publicKey),
      });
      await api("/api/mobile/push/subscription", { method: "POST", body: JSON.stringify(subscription.toJSON()) });
      setSubscribed(true);
      setMessage("Đã bật thông báo đẩy trên trình duyệt này.");
    } catch (error: any) {
      setMessage(error?.message || "Không thể bật thông báo đẩy.");
    }
  };
  const disableNotifications = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await api("/api/mobile/push/subscription", { method: "DELETE", body: JSON.stringify({ endpoint: subscription.endpoint }) });
        await subscription.unsubscribe();
      }
      setSubscribed(false);
      setMessage("Đã tắt thông báo đẩy trên trình duyệt này.");
    } catch (error: any) {
      setMessage(error?.message || "Không thể tắt thông báo đẩy.");
    }
  };
  const install = async () => { if (installEvent) { await installEvent.prompt(); await installEvent.userChoice; setInstallEvent(null); } else setMessage("Ứng dụng đã được cài đặt hoặc trình duyệt chưa hỗ trợ."); };
  if (!user) return <Protected auth={auth}>{null}</Protected>;
  return <Protected auth={auth}><PageTitle eyebrow="Không gian cá nhân" title="Cài đặt" detail="Kiểm soát hồ sơ, quyền truy cập và cách EasyEdu liên lạc với bạn." /><div className="grid gap-5 lg:grid-cols-[1fr_360px]"><section className="space-y-5"><div data-testid="panel-profile" className="panel rounded-[24px] bg-[hsl(var(--card))] p-6 sm:p-7"><div className="flex items-center gap-4"><Avatar user={user} /><div><p data-testid="text-profile-name" className="text-lg font-bold">{user.name || user.username}</p><p data-testid="text-profile-role" className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{roleLabels[user.role]} · {user.username}</p></div></div><div className="mt-7 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl bg-[hsl(var(--muted))] p-4"><p className="mono text-[10px] uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]">Mã hồ sơ</p><p className="mt-2 text-sm font-bold">{user.profileCode || "Chưa cập nhật"}</p></div><div className="rounded-2xl bg-[hsl(var(--muted))] p-4"><p className="mono text-[10px] uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]">Trung tâm</p><p className="mt-2 truncate text-sm font-bold">{user.centerUrl.replace(/^https?:\/\//, "")}</p></div><div className="rounded-2xl bg-[hsl(var(--muted))] p-4"><p className="mono text-[10px] uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]">Quyền truy cập</p><p data-testid="text-permission-status" className="mt-2 text-sm font-bold">{auth.permissions?.isSuperAdmin ? "Quản trị toàn hệ thống" : "Theo vai trò"}</p></div></div></div><div data-testid="panel-notification-settings" className="panel rounded-[24px] bg-[hsl(var(--card))] p-6 sm:p-7"><div className="flex items-start gap-4"><div className="rounded-2xl bg-[#d7ebe9] p-3 text-[hsl(var(--primary))]"><Bell className="h-5 w-5" /></div><div className="flex-1"><h2 className="text-sm font-bold">Thông báo đẩy trên trình duyệt</h2><p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{pushConfig?.enabled ? "Nhận nhắc lịch học và cập nhật mới, khi bạn cho phép." : "Trung tâm chưa sẵn sàng cho thông báo đẩy."}</p></div><Badge tone={subscribed ? "good" : "warn"}>{subscribed ? "Đã bật" : "Chưa bật"}</Badge></div><div className="mt-6 flex flex-wrap gap-3"><button data-testid="button-request-notification" onClick={requestNotifications} disabled={subscribed} className="button-primary rounded-xl px-4 py-2.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50">{subscribed ? "Đã cấp quyền" : "Bật thông báo"}</button>{subscribed && <button data-testid="button-disable-notification" onClick={disableNotifications} className="button-quiet rounded-xl border border-[hsl(var(--border))] px-4 py-2.5 text-sm font-bold">Tắt thông báo</button>}</div></div></section><aside className="space-y-5"><div data-testid="panel-install-settings" className="panel rounded-[24px] bg-[#dcefe7] p-6 text-[#23634f]"><Smartphone className="h-6 w-6" /><h2 className="display mt-6 text-3xl font-semibold">Ứng dụng web</h2><p className="mt-2 text-sm opacity-75">Mở EasyEdu như một ứng dụng riêng, không cần tìm lại trong trình duyệt.</p><button data-testid="button-install-settings" onClick={install} className="mt-6 rounded-xl bg-[#23634f] px-4 py-2.5 text-sm font-bold text-[#e6f5ee]">{installEvent ? "Cài đặt ngay" : "Kiểm tra cài đặt"}</button></div><div className="panel rounded-[24px] bg-[hsl(var(--card))] p-6"><button data-testid="button-sign-out" onClick={auth.logout} className="flex w-full items-center gap-3 rounded-xl px-1 py-2 text-left text-sm font-bold text-[hsl(var(--destructive))] hover:bg-[hsl(var(--muted))]"><LogOut className="h-4 w-4" />Đăng xuất khỏi EasyEdu</button>{message && <p data-testid="status-settings-message" className="mt-4 flex gap-2 text-xs text-[hsl(var(--muted-foreground))]"><Info className="h-4 w-4 shrink-0" />{message}</p>}</div></aside></div></Protected>;
}

function Login({ auth }: { auth: ReturnType<typeof useAuthState> }) {
  const [, setLocation] = useLocation();
  const [url, setUrl] = useState(localStorage.getItem("edu_center_url") || window.location.origin);
  const [username, setUsername] = useState(localStorage.getItem("edu_last_username") || "");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e: Event) => { e.preventDefault(); setError(""); setSubmitting(true); try { await auth.login(url, username, password); setLocation("/"); } catch (err) { setError(err instanceof Error ? err.message : "Đăng nhập thất bại. Vui lòng thử lại."); } finally { setSubmitting(false); } };
  return <div className="grain flex min-h-[100dvh] bg-[hsl(var(--background))]"><div className="hidden w-[42%] flex-col justify-between bg-[hsl(var(--primary))] p-10 text-[hsl(var(--primary-foreground))] lg:flex xl:p-14"><div><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-[hsl(var(--primary-foreground))]/10"><GraduationCap className="h-6 w-6" /></div><span className="display text-2xl font-bold">EasyEdu</span></div><div className="mt-28 max-w-md"><p className="mono text-[10px] uppercase tracking-[.2em] opacity-60">Một nơi để bắt đầu</p><h1 className="display mt-5 text-6xl font-semibold leading-[.96]">Học tập, <em className="text-[hsl(var(--accent))]">rõ ràng</em> hơn.</h1><p className="mt-7 max-w-sm text-sm leading-7 opacity-70">Lịch học, điểm danh, kết quả và những điều cần nhớ — ở ngay trước mắt.</p></div></div><div className="flex items-center justify-between text-xs opacity-55"><span>© EasyEdu Workspace</span><span className="mono">v1.0</span></div></div><div className="flex flex-1 items-center justify-center px-5 py-10 sm:px-10"><div className="w-full max-w-[430px]"><div className="mb-12 lg:hidden"><div className="flex items-center gap-2"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"><GraduationCap className="h-5 w-5" /></div><span className="display text-2xl font-bold">EasyEdu</span></div></div><div className="mb-9"><p className="mono text-[10px] uppercase tracking-[.2em] text-[hsl(var(--primary))]">Chào mừng trở lại</p><h2 className="display mt-3 text-4xl font-semibold">Đăng nhập</h2><p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">Kết nối với không gian học tập của bạn.</p></div><form onSubmit={submit as any} className="space-y-5"><label className="block"><span className="mb-2 block text-xs font-bold">URL trung tâm</span><div className="relative"><LinkIcon className="absolute left-3 top-3.5 h-4 w-4 text-[hsl(var(--muted-foreground))]" /><input data-testid="input-center-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://ten-trung-tam.vn" className="h-11 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] pl-10 pr-3 text-sm outline-none transition focus:border-[hsl(var(--primary))] focus:ring-2 focus:ring-[hsl(var(--primary))]/15" /></div></label><label className="block"><span className="mb-2 block text-xs font-bold">Tên đăng nhập</span><div className="relative"><UserRound className="absolute left-3 top-3.5 h-4 w-4 text-[hsl(var(--muted-foreground))]" /><input data-testid="input-username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Nhập tên đăng nhập" className="h-11 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] pl-10 pr-3 text-sm outline-none transition focus:border-[hsl(var(--primary))] focus:ring-2 focus:ring-[hsl(var(--primary))]/15" /></div></label><label className="block"><span className="mb-2 block text-xs font-bold">Mật khẩu</span><div className="relative"><KeyRound className="absolute left-3 top-3.5 h-4 w-4 text-[hsl(var(--muted-foreground))]" /><input data-testid="input-password" autoComplete="current-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Nhập mật khẩu" className="h-11 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] pl-10 pr-3 text-sm outline-none transition focus:border-[hsl(var(--primary))] focus:ring-2 focus:ring-[hsl(var(--primary))]/15" /></div></label>{error && <div data-testid="status-login-error" className="flex gap-2 rounded-xl bg-[#f8dfdc] p-3 text-xs font-semibold text-[#a7443a]"><CircleAlert className="h-4 w-4 shrink-0" />{error}</div>}<button data-testid="button-submit-login" disabled={submitting || !url || !username || !password} className="button-primary flex h-12 w-full items-center justify-center rounded-xl text-sm font-bold disabled:cursor-not-allowed disabled:opacity-45">{submitting ? "Đang kết nối…" : "Đăng nhập vào EasyEdu"}{!submitting && <ArrowRight className="ml-2 h-4 w-4" />}</button></form><p className="mt-7 text-center text-[11px] leading-5 text-[hsl(var(--muted-foreground))]">Thông tin đăng nhập được gửi trực tiếp đến trung tâm của bạn.</p></div></div></div>;
}

function RouterView({ auth }: { auth: ReturnType<typeof useAuthState> }) {
  return <Switch><Route path="/login"><Login auth={auth} /></Route><Route path="/"><Overview auth={auth} /></Route><Route path="/schedule"><Schedule auth={auth} /></Route><Route path="/classes"><Classes auth={auth} /></Route><Route path="/attendance"><Attendance auth={auth} /></Route><Route path="/grades"><Grades auth={auth} /></Route><Route path="/tuition"><Tuition auth={auth} /></Route><Route path="/notifications"><Notifications auth={auth} /></Route><Route path="/settings"><Settings auth={auth} /></Route><Route component={NotFound} /></Switch>;
}
function RoutedErrorBoundary({ auth }: { auth: ReturnType<typeof useAuthState> }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}><RouterView auth={auth} /></ErrorBoundary>;
}
function App() {
  const auth = useAuthState();
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}><RoutedErrorBoundary auth={auth} /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}
export default App;