import {
  ArrowUpRight,
  BarChart3,
  Bell,
  BookOpen,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronRight,
  CircleCheck,
  ClipboardList,
  Clock3,
  DollarSign,
  FileText,
  Flag,
  LayoutDashboard,
  Menu,
  MessageCircle,
  Pin,
  School,
  Star,
  Timer,
  Users,
  XCircle,
} from "lucide-react";
import { useState, type ElementType } from "react";

import "./_group.css";

type Role = "student" | "parent" | "staff";
type Shortcut = { label: string; icon: ElementType; tint: string; ink: string };

const roleLabels: Record<Role, string> = {
  student: "Học viên",
  parent: "Phụ huynh",
  staff: "Nhân sự",
};

const statsByRole: Record<Role, { label: string; value: string; note: string; icon: ElementType; color: string }[]> = {
  student: [
    { label: "Lớp học", value: "0", note: "đang theo học", icon: BookOpen, color: "#3d65db" },
    { label: "BT xong", value: "1/4", note: "bài trong tuần", icon: CircleCheck, color: "#0b9a78" },
    { label: "Điểm sao", value: "34", note: "sao đang có", icon: Star, color: "#e69628" },
  ],
  parent: [
    { label: "Học viên", value: "2", note: "đang đồng hành", icon: Users, color: "#3d65db" },
    { label: "Lớp học", value: "4", note: "tổng lớp đang học", icon: School, color: "#0b9a78" },
    { label: "Buổi đã học", value: "18", note: "tích luỹ tháng này", icon: CircleCheck, color: "#e69628" },
  ],
  staff: [
    { label: "Lớp học", value: "8", note: "đang phụ trách", icon: BookOpen, color: "#3d65db" },
    { label: "Công việc", value: "12/17", note: "đã hoàn thành", icon: CircleCheck, color: "#0b9a78" },
    { label: "Đã dạy", value: "18/24", note: "buổi trong tháng", icon: Timer, color: "#e69628" },
  ],
};

const studentShortcuts: Shortcut[] = [
  { label: "Lịch học", icon: CalendarDays, tint: "#e6edff", ink: "#3d65db" },
  { label: "BTVN", icon: BookOpen, tint: "#fff0c7", ink: "#b26e12" },
  { label: "Bảng điểm", icon: BarChart3, tint: "#dcf5e9", ink: "#0b8f70" },
  { label: "Hoá đơn", icon: FileText, tint: "#fff4c7", ink: "#9f7810" },
  { label: "Xin nghỉ", icon: XCircle, tint: "#ffe5e4", ink: "#d44b4b" },
];

const staffShortcuts: Shortcut[] = [
  { label: "Bài tập\nKiểm tra", icon: ClipboardList, tint: "#e6edff", ink: "#3d65db" },
  { label: "HV sắp\nhết lịch", icon: Clock3, tint: "#fff0df", ink: "#c66b27" },
  { label: "Bảng điểm", icon: BarChart3, tint: "#dcf5e9", ink: "#0b8f70" },
  { label: "Lớp sắp\nkết thúc", icon: Flag, tint: "#f1e5ff", ink: "#8752bc" },
  { label: "Lương\nđứng lớp", icon: BriefcaseBusiness, tint: "#e5efff", ink: "#2675b7" },
  { label: "Hoá đơn", icon: FileText, tint: "#fff4c7", ink: "#9f7810" },
  { label: "Xin nghỉ", icon: CalendarDays, tint: "#ffe5e4", ink: "#d44b4b" },
  { label: "Tổng lương", icon: DollarSign, tint: "#dcf5e9", ink: "#0b8f70" },
  { label: "Dashboard", icon: LayoutDashboard, tint: "#ece8ff", ink: "#6550c7" },
];

const promotions = [
  { eyebrow: "Ưu đãi tháng 9", title: "Đăng ký ngay, nhận quà học tập", detail: "Ưu đãi đến 1.000.000đ cho học viên mới", tone: "sun" },
  { eyebrow: "Bạn bè cùng tiến", title: "Rủ bạn học chung, cùng nhận sao", detail: "Tặng 20 điểm sao cho mỗi lượt giới thiệu", tone: "aqua" },
];

const newsItems = [
  { category: "Thông báo", title: "Lịch nghỉ lễ Quốc khánh 2/9", author: "EasyEdu", time: "2 giờ trước", tone: "blue" },
  { category: "Học thuật", title: "Bí quyết ôn tập trước kỳ kiểm tra giữa kỳ", author: "Cô Minh Anh", time: "Hôm qua", tone: "peach" },
];

function ProgressRing({ role }: { role: Role }) {
  const progress = role === "student" ? 68 : role === "parent" ? 74 : 76;
  const radius = 53;
  const circumference = 2 * Math.PI * radius;
  const dash = (circumference * progress) / 100;

  return (
    <div className="progress-ring" aria-label={`Tiến độ tuần này ${progress}%`}>
      <svg viewBox="0 0 128 128" role="img" aria-hidden="true">
        <circle className="ring-track" cx="64" cy="64" r={radius} />
        <circle
          className="ring-value"
          cx="64"
          cy="64"
          r={radius}
          strokeDasharray={`${dash} ${circumference - dash}`}
        />
      </svg>
      <div className="ring-center">
        <strong className="display-font">{progress}%</strong>
        <span>tiến độ</span>
      </div>
    </div>
  );
}

function StatStrip({ role }: { role: Role }) {
  return (
    <div className="stat-strip" aria-label={`Tổng quan ${roleLabels[role]}`}>
      {statsByRole[role].map(({ label, value, note, icon: Icon, color }) => (
        <div className="mini-stat" key={label}>
          <div className="mini-stat-icon" style={{ backgroundColor: `${color}16`, color }}>
            <Icon size={16} strokeWidth={2.4} />
          </div>
          <strong className="display-font">{value}</strong>
          <span>{label}</span>
          <small>{note}</small>
        </div>
      ))}
    </div>
  );
}

function ShortcutGrid({
  role,
  onShortcut,
}: {
  role: Role;
  onShortcut: (label: string) => void;
}) {
  const shortcuts = role === "staff" ? staffShortcuts : studentShortcuts;
  return (
    <section className="section-block fade-up delay-2">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Mở nhanh</span>
          <h2 className="display-font">Việc cần làm</h2>
        </div>
        <span className="section-count">{shortcuts.length} lối tắt</span>
      </div>
      <div className={`shortcut-grid ${role === "staff" ? "shortcut-grid-staff" : ""}`}>
        {shortcuts.map(({ label, icon: Icon, tint, ink }) => (
          <button
            className="shortcut"
            key={label}
            type="button"
            onClick={() => onShortcut(label.replace("\n", " "))}
          >
            <span className="shortcut-icon" style={{ backgroundColor: tint, color: ink }}>
              <Icon size={20} strokeWidth={2.15} />
            </span>
            <span>{label.split("\n").map((line, index) => <span key={line}>{index > 0 && <br />}{line}</span>)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function PromotionCard({
  item,
  onOpen,
}: {
  item: (typeof promotions)[number];
  onOpen: () => void;
}) {
  return (
    <button className={`promo-card promo-${item.tone}`} type="button" onClick={onOpen}>
      <span className="promo-shape promo-shape-one" />
      <span className="promo-shape promo-shape-two" />
      <span className="promo-copy">
        <span className="promo-eyebrow">{item.eyebrow}</span>
        <strong className="display-font">{item.title}</strong>
        <span>{item.detail}</span>
        <span className="promo-link">Xem ưu đãi <ArrowUpRight size={13} /></span>
      </span>
    </button>
  );
}

export function BentoProgress() {
  const [role, setRole] = useState<Role>("student");
  const [activeNav, setActiveNav] = useState("Trang chủ");
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [toast, setToast] = useState("");

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  };

  const switchRole = (nextRole: Role) => {
    setRole(nextRole);
    notify(`Đã xem trang dành cho ${roleLabels[nextRole].toLowerCase()}`);
  };

  return (
    <div className="home-redesign-frame">
      <main className="cockpit-shell">
        <header className="cockpit-header fade-up">
          <div className="brand-row">
            <div className="brand-mark">E</div>
            <span className="brand-name display-font">easyedu</span>
            <span className="header-date">Thứ Tư, 16 Tháng 9</span>
            <button
              className="notification-button"
              type="button"
              aria-label="Mở thông báo"
              onClick={() => setNoticeOpen((open) => !open)}
            >
              <Bell size={19} strokeWidth={2.25} />
              <span>3</span>
            </button>
          </div>
          <div className="greeting-row">
            <div className="avatar" aria-label="Ảnh đại diện Học viên 1">H</div>
            <div>
              <p className="greeting-kicker">Chào buổi sáng,</p>
              <h1 className="display-font">Học viên 1 <span>•</span></h1>
            </div>
            <div className="role-switcher" aria-label="Chọn vai trò để xem preview">
              {(Object.keys(roleLabels) as Role[]).map((option) => (
                <button
                  className={role === option ? "role-pill active" : "role-pill"}
                  type="button"
                  key={option}
                  onClick={() => switchRole(option)}
                >
                  {roleLabels[option]}
                </button>
              ))}
            </div>
          </div>
        </header>

        <div className="cockpit-content">
          <section className="progress-story fade-up delay-1">
            <div className="story-topline">
              <div>
                <span className="eyebrow light-eyebrow">BỨC TRANH TUẦN NÀY</span>
                <h2 className="display-font">Đà học đang lên.</h2>
              </div>
              <span className="week-badge">Tuần 38 <ChevronRight size={14} /></span>
            </div>
            <div className="story-main">
              <ProgressRing role={role} />
              <div className="story-summary">
                <p>Đã hoàn thành <strong>{role === "student" ? "3 trên 5" : role === "parent" ? "8 trên 11" : "19 trên 25"} mục tiêu</strong></p>
                <div className="story-check"><Check size={13} /> Duy trì nhịp học đều 4 ngày</div>
                <div className="story-check muted-check"><Check size={13} /> Còn 2 việc trước thứ Sáu</div>
                <button className="story-action" type="button" onClick={() => notify("Đang mở toàn bộ mục tiêu tuần")}>
                  Xem mục tiêu tuần <ArrowUpRight size={15} />
                </button>
              </div>
            </div>
            <div className="next-action">
              <div className="next-action-icon"><Clock3 size={17} /></div>
              <div>
                <span>Gợi ý tiếp theo</span>
                <strong>{role === "staff" ? "Duyệt 3 đơn nghỉ còn chờ" : "Hoàn thành BTVN Toán — bài 04"}</strong>
              </div>
              <button type="button" aria-label="Mở gợi ý tiếp theo" onClick={() => notify("Đã chọn hành động tiếp theo")}>
                <ChevronRight size={18} />
              </button>
            </div>
          </section>

          <StatStrip role={role} />

          {noticeOpen && (
            <aside className="notice-popover fade-up" aria-label="Thông báo mới">
              <div className="notice-title"><span>Thông báo mới</span><button type="button" onClick={() => setNoticeOpen(false)} aria-label="Đóng thông báo">Đóng</button></div>
              <p><span className="notice-dot" /> Cô Minh Anh đã gửi nhận xét bài tập của bạn.</p>
              <p><span className="notice-dot warm" /> Lịch học ngày mai đã được cập nhật.</p>
              <button className="notice-all" type="button" onClick={() => notify("Đã mở toàn bộ thông báo")}>Xem tất cả thông báo <ArrowUpRight size={14} /></button>
            </aside>
          )}

          <ShortcutGrid role={role} onShortcut={notify} />

          <section className="section-block fade-up delay-3">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Điểm cộng hôm nay</span>
                <h2 className="display-font">Khuyến mãi <span className="count-badge">2</span></h2>
              </div>
              <button className="text-button" type="button" onClick={() => notify("Đã mở kho ưu đãi")}>Xem kho <ArrowUpRight size={14} /></button>
            </div>
            <div className="promo-scroller">
              {promotions.map((item) => (
                <PromotionCard key={item.title} item={item} onOpen={() => notify(`Đã mở: ${item.title}`)} />
              ))}
            </div>
          </section>

          <section className="section-block fade-up delay-4">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Từ trung tâm</span>
                <h2 className="display-font">Bảng tin</h2>
              </div>
              <button className="text-button" type="button" onClick={() => notify("Đã mở toàn bộ bảng tin")}>Xem tất cả <ArrowUpRight size={14} /></button>
            </div>
            <div className="news-list">
              {newsItems.map((item) => (
                <button className="news-card" type="button" key={item.title} onClick={() => notify(`Đã mở tin: ${item.title}`)}>
                  <div className={`news-visual news-${item.tone}`}>
                    <span className="news-visual-line" />
                    <span className="news-visual-circle" />
                    <span className="pin-mark"><Pin size={12} fill="currentColor" /></span>
                  </div>
                  <div className="news-copy">
                    <div className="news-meta"><span className="pinned-label"><Pin size={11} fill="currentColor" /> Đã ghim</span><span>{item.category}</span></div>
                    <strong>{item.title}</strong>
                    <span>{item.author} · {item.time}</span>
                  </div>
                  <ChevronRight className="news-chevron" size={17} />
                </button>
              ))}
            </div>
          </section>
        </div>

        <nav className="bottom-nav" aria-label="Điều hướng chính">
          {[
            { label: "Trang chủ", icon: School },
            { label: "Lịch", icon: CalendarDays },
            { label: "BTVN", icon: BookOpen },
            { label: "Bảng điểm", icon: BarChart3 },
            { label: "Chat", icon: MessageCircle, badge: "3" },
            { label: "Menu", icon: Menu },
          ].map(({ label, icon: Icon, badge }) => (
            <button
              type="button"
              className={activeNav === label ? "nav-item active" : "nav-item"}
              key={label}
              onClick={() => {
                setActiveNav(label);
                if (label !== "Trang chủ") notify(`Đã chọn ${label}`);
              }}
            >
              <span className="nav-icon-wrap"><Icon size={18} strokeWidth={2.15} />{badge && <em>{badge}</em>}</span>
              <span>{label}</span>
            </button>
          ))}
        </nav>

        {toast && <div className="toast-message" role="status">{toast}</div>}
      </main>
    </div>
  );
}

export default BentoProgress;