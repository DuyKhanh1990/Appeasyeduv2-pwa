import {
  ArrowRight,
  BarChart3,
  Bell,
  BookOpen,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  Flag,
  GraduationCap,
  LayoutGrid,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Pin,
  ReceiptText,
  Sparkles,
  Star,
  Users,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import "./_group.css";

type Role = "student" | "parent" | "staff";

type Shortcut = {
  label: string;
  icon: typeof CalendarDays;
  tone: string;
};

const studentShortcuts: Shortcut[] = [
  { label: "Lịch học", icon: CalendarDays, tone: "blue" },
  { label: "BTVN", icon: BookOpen, tone: "yellow" },
  { label: "Bảng điểm", icon: BarChart3, tone: "mint" },
  { label: "Hoá đơn", icon: ReceiptText, tone: "gold" },
  { label: "Xin nghỉ", icon: XCircle, tone: "rose" },
];

const staffShortcuts: Shortcut[] = [
  { label: "Bài tập / Kiểm tra", icon: ClipboardCheck, tone: "blue" },
  { label: "HV sắp hết lịch", icon: MoreHorizontal, tone: "orange" },
  { label: "Bảng điểm", icon: BarChart3, tone: "mint" },
  { label: "Lớp sắp kết thúc", icon: Flag, tone: "violet" },
  { label: "Lương đứng lớp", icon: BriefcaseBusiness, tone: "sky" },
  { label: "Hoá đơn", icon: ReceiptText, tone: "gold" },
  { label: "Xin nghỉ", icon: CalendarDays, tone: "rose" },
  { label: "Tổng lương", icon: CircleDollarSign, tone: "emerald" },
  { label: "Dashboard", icon: LayoutGrid, tone: "indigo" },
];

const roleData = {
  student: {
    name: "Học viên",
    greeting: "Chào, Minh Anh",
    avatar: "M",
    stats: [
      { label: "Lớp học", value: "3", icon: BookOpen, tone: "blue" },
      { label: "BT xong", value: "1/4", icon: CheckCircle2, tone: "mint" },
      { label: "Điểm sao", value: "34", icon: Star, tone: "yellow" },
    ],
  },
  parent: {
    name: "Phụ huynh",
    greeting: "Chào, chị Hương",
    avatar: "H",
    stats: [
      { label: "Học viên", value: "2", icon: Users, tone: "blue" },
      { label: "Lớp học", value: "5", icon: BookOpen, tone: "mint" },
      { label: "Buổi đã học", value: "42", icon: CheckCircle2, tone: "yellow" },
    ],
  },
  staff: {
    name: "Giáo viên",
    greeting: "Chào, cô Lan",
    avatar: "L",
    stats: [
      { label: "Lớp học", value: "8", icon: BookOpen, tone: "blue" },
      { label: "Công việc", value: "6/9", icon: CheckCircle2, tone: "mint" },
      { label: "Đã dạy", value: "18/24", icon: Star, tone: "yellow" },
    ],
  },
} as const;

const toneClass: Record<string, string> = {
  blue: "mg-tone-blue",
  yellow: "mg-tone-yellow",
  mint: "mg-tone-mint",
  gold: "mg-tone-gold",
  rose: "mg-tone-rose",
  orange: "mg-tone-orange",
  violet: "mg-tone-violet",
  sky: "mg-tone-sky",
  emerald: "mg-tone-emerald",
  indigo: "mg-tone-indigo",
};

function ShortcutTile({
  shortcut,
  onSelect,
}: {
  shortcut: Shortcut;
  onSelect: (label: string) => void;
}) {
  const Icon = shortcut.icon;
  return (
    <button
      type="button"
      className="mg-shortcut"
      onClick={() => onSelect(shortcut.label)}
      aria-label={`Mở ${shortcut.label}`}
    >
      <span className={`mg-shortcut-icon ${toneClass[shortcut.tone]}`}>
        <Icon size={20} strokeWidth={2.1} />
      </span>
      <span className="mg-shortcut-label">{shortcut.label}</span>
    </button>
  );
}

export function ModernGradient() {
  const [role, setRole] = useState<Role>("student");
  const [activeNav, setActiveNav] = useState("Trang chủ");
  const [expandedStaff, setExpandedStaff] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [toast, setToast] = useState("");
  const current = roleData[role];

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  };

  const handleShortcut = (label: string) => showToast(`${label} sắp mở`);

  return (
    <div className="home-redesign-frame">
      <div className="mg-stage">
        <main className="mg-phone" aria-label="EasyEdu trang chủ">
          <section className="mg-hero">
            <div className="mg-hero-orb mg-hero-orb-one" />
            <div className="mg-hero-orb mg-hero-orb-two" />
            <div className="mg-hero-grid" />
            <header className="mg-topbar">
              <div className="mg-profile">
                <button type="button" className="mg-avatar" onClick={() => showToast("Hồ sơ của bạn")}>
                  {current.avatar}
                  <span className="mg-online-dot" />
                </button>
                <div>
                  <p className="mg-date">Thứ Tư, 16 Tháng 9</p>
                  <h1>{current.greeting}</h1>
                </div>
              </div>
              <button
                type="button"
                className={`mg-notification ${noticeOpen ? "is-open" : ""}`}
                aria-label="Thông báo chưa đọc"
                onClick={() => setNoticeOpen((value) => !value)}
              >
                <Bell size={19} strokeWidth={2.2} />
                <span className="mg-notification-count">3</span>
              </button>
            </header>

            <div className="mg-role-switch" role="tablist" aria-label="Chế độ xem">
              <button
                type="button"
                className={role === "student" ? "is-active" : ""}
                onClick={() => setRole("student")}
                role="tab"
                aria-selected={role === "student"}
              >
                Học viên
              </button>
              <button
                type="button"
                className={role === "parent" ? "is-active" : ""}
                onClick={() => setRole("parent")}
                role="tab"
                aria-selected={role === "parent"}
              >
                Phụ huynh
              </button>
              <button
                type="button"
                className={role === "staff" ? "is-active" : ""}
                onClick={() => setRole("staff")}
                role="tab"
                aria-selected={role === "staff"}
              >
                Trung tâm
              </button>
            </div>

            {noticeOpen && (
              <div className="mg-notice-popover">
                <span className="mg-notice-mark">
                  <Bell size={15} />
                </span>
                <div>
                  <strong>3 thông báo mới</strong>
                  <p>Lịch học ngày mai đã được cập nhật.</p>
                </div>
                <button type="button" onClick={() => setNoticeOpen(false)} aria-label="Đóng thông báo">
                  <XCircle size={16} />
                </button>
              </div>
            )}
          </section>

          <section className="mg-content">
            <div className="mg-stats" aria-label="Tổng quan tiến độ">
              {current.stats.map((stat) => {
                const Icon = stat.icon;
                return (
                  <div className="mg-stat" key={stat.label}>
                    <span className={`mg-stat-icon ${toneClass[stat.tone]}`}>
                      <Icon size={17} strokeWidth={2.2} />
                    </span>
                    <strong>{stat.value}</strong>
                    <span>{stat.label}</span>
                  </div>
                );
              })}
            </div>

            <section className="mg-next-action">
              <div className="mg-next-copy">
                <div className="mg-eyebrow">
                  <Sparkles size={13} />
                  VIỆC TIẾP THEO
                </div>
                <h2>
                  {role === "student"
                    ? "Hoàn thành BTVN"
                    : role === "parent"
                      ? "Theo dõi tiến độ con"
                      : "Duyệt bài tập tuần này"}
                </h2>
                <p>
                  {role === "student"
                    ? "Còn 3 bài, bạn đã hoàn thành 1 bài rồi."
                    : role === "parent"
                      ? "Minh Anh vừa hoàn thành bài Toán nâng cao."
                      : "6 bài đang chờ cô xem trước buổi học."}
                </p>
                <button type="button" className="mg-primary-action" onClick={() => handleShortcut("BTVN")}>
                  {role === "student" ? "Làm ngay" : role === "parent" ? "Xem tiến độ" : "Xem danh sách"}
                  <ArrowRight size={16} />
                </button>
              </div>
              <div className="mg-progress-ring" aria-label="Tiến độ 25 phần trăm">
                <span>25<small>%</small></span>
              </div>
            </section>

            <section className="mg-section">
              <div className="mg-section-heading">
                <div>
                  <p className="mg-kicker">ĐIỂM ĐẾN NHANH</p>
                  <h2>{role === "staff" ? "Học vụ hôm nay" : "Lối tắt"}</h2>
                </div>
                <span className="mg-heading-note">{role === "staff" ? "9 mục" : "5 mục"}</span>
              </div>
              <div className="mg-shortcuts">
                {(role !== "staff" ? studentShortcuts : staffShortcuts.slice(0, expandedStaff ? 9 : 6)).map(
                  (shortcut) => (
                    <ShortcutTile shortcut={shortcut} onSelect={handleShortcut} key={shortcut.label} />
                  ),
                )}
              </div>
              {role === "staff" && (
                <button
                  type="button"
                  className="mg-expand"
                  onClick={() => setExpandedStaff((value) => !value)}
                >
                  {expandedStaff ? "Thu gọn" : "Xem thêm 3 lối tắt"}
                  <ChevronDown className={expandedStaff ? "mg-rotate" : ""} size={16} />
                </button>
              )}
            </section>

            <section className="mg-promo-section">
              <div className="mg-section-heading">
                <div>
                  <p className="mg-kicker mg-kicker-coral">ĐANG DIỄN RA</p>
                  <h2>Khuyến mãi <span className="mg-count">2</span></h2>
                </div>
                <button type="button" className="mg-text-button" onClick={() => showToast("Đã mở tất cả khuyến mãi")}>
                  Tất cả
                  <ChevronRight size={15} />
                </button>
              </div>
              <button type="button" className="mg-promo" onClick={() => showToast("Đã mở ưu đãi tháng 9")}>
                <div className="mg-promo-spark spark-a" />
                <div className="mg-promo-spark spark-b" />
                <div className="mg-promo-copy">
                  <span className="mg-promo-tag">ƯU ĐÃI THÁNG 9</span>
                  <strong>Học tốt, nhận quà thật</strong>
                  <p>Đăng ký ngay · Ưu đãi đến 1.000.000đ</p>
                  <span className="mg-promo-link">Xem ưu đãi <ArrowRight size={14} /></span>
                </div>
                <div className="mg-promo-token">
                  <span>−</span>
                  <strong>1M</strong>
                  <small>đồng</small>
                </div>
              </button>
            </section>

            <section className="mg-section mg-news-section">
              <div className="mg-section-heading">
                <div>
                  <p className="mg-kicker">CẬP NHẬT TỪ TRUNG TÂM</p>
                  <h2>Bảng tin</h2>
                </div>
                <button type="button" className="mg-text-button" onClick={() => showToast("Đã mở bảng tin")}>
                  Xem tất cả
                  <ChevronRight size={15} />
                </button>
              </div>
              <div className="mg-news-list">
                <button type="button" className="mg-news-card" onClick={() => showToast("Đã mở thông báo lịch học")}>
                  <div className="mg-news-visual mg-news-blue">
                    <CalendarDays size={25} />
                    <span>16.09</span>
                  </div>
                  <div className="mg-news-body">
                    <span className="mg-pinned"><Pin size={11} /> Đã ghim</span>
                    <strong>Lịch học tuần mới đã cập nhật</strong>
                    <p>Phòng học và giáo viên đã sẵn sàng.</p>
                    <small>Phòng đào tạo · 2 giờ trước</small>
                  </div>
                  <ChevronRight className="mg-news-arrow" size={17} />
                </button>
                <button type="button" className="mg-news-card" onClick={() => showToast("Đã mở hoạt động tháng 9")}>
                  <div className="mg-news-visual mg-news-coral">
                    <GraduationCap size={25} />
                    <span>CLB</span>
                  </div>
                  <div className="mg-news-body">
                    <span className="mg-pinned"><Pin size={11} /> Đã ghim</span>
                    <strong>Thử thách đọc sách tháng 9</strong>
                    <p>Tích điểm sao cùng bạn bè trong lớp.</p>
                    <small>EasyEdu · Hôm qua</small>
                  </div>
                  <ChevronRight className="mg-news-arrow" size={17} />
                </button>
              </div>
            </section>
          </section>

          <nav className="mg-bottom-nav" aria-label="Điều hướng chính">
            {[
              { label: "Trang chủ", icon: LayoutGrid },
              { label: "Lịch", icon: CalendarDays },
              { label: "BTVN", icon: BookOpen },
              { label: "Bảng điểm", icon: BarChart3 },
              { label: "Chat", icon: MessageCircle, badge: "3" },
              { label: "Menu", icon: Menu },
            ].map((item) => {
              const Icon = item.icon;
              const isActive = activeNav === item.label;
              return (
                <button
                  type="button"
                  className={`mg-nav-item ${isActive ? "is-active" : ""}`}
                  key={item.label}
                  onClick={() => {
                    setActiveNav(item.label);
                    if (item.label !== "Trang chủ") showToast(`${item.label} sắp mở`);
                  }}
                >
                  <span className="mg-nav-icon">
                    <Icon size={19} strokeWidth={isActive ? 2.5 : 2} />
                    {item.badge && <span className="mg-chat-badge">{item.badge}</span>}
                  </span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {toast && <div className="mg-toast">{toast}</div>}
        </main>
      </div>

      <style>{`
        .mg-stage {
          min-height: 100vh;
          display: flex;
          justify-content: center;
          align-items: flex-start;
          padding: 0;
        }
        .mg-phone {
          width: 100%;
          max-width: 390px;
          min-height: 100vh;
          position: relative;
          overflow: hidden;
          background: #f4f7fb;
          color: #19223b;
          box-shadow: 0 26px 90px rgba(35, 47, 84, .17);
        }
        .mg-hero {
          height: 218px;
          position: relative;
          overflow: hidden;
          padding: 18px 20px 0;
          background: linear-gradient(140deg, #233b8f 0%, #3964d7 57%, #4e89e5 100%);
          color: #fff;
        }
        .mg-hero-grid {
          position: absolute;
          inset: 0;
          opacity: .15;
          background-image: linear-gradient(rgba(255,255,255,.18) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.18) 1px, transparent 1px);
          background-size: 32px 32px;
          mask-image: linear-gradient(135deg, black, transparent 75%);
        }
        .mg-hero-orb {
          position: absolute;
          border-radius: 999px;
          pointer-events: none;
          border: 1px solid rgba(255,255,255,.22);
        }
        .mg-hero-orb-one { width: 188px; height: 188px; right: -56px; top: -100px; box-shadow: 0 0 0 24px rgba(255,255,255,.04), 0 0 0 48px rgba(255,255,255,.035); }
        .mg-hero-orb-two { width: 100px; height: 100px; left: -48px; bottom: -62px; opacity: .55; }
        .mg-topbar, .mg-profile { display: flex; align-items: center; }
        .mg-topbar { position: relative; z-index: 2; justify-content: space-between; }
        .mg-profile { gap: 11px; }
        .mg-avatar {
          position: relative;
          width: 45px; height: 45px; flex: 0 0 auto;
          display: grid; place-items: center;
          border-radius: 50%;
          color: #dce8ff;
          background: rgba(255,255,255,.14);
          border: 1.5px solid rgba(255,255,255,.7);
          font-family: "Manrope", sans-serif;
          font-size: 19px; font-weight: 800;
          cursor: pointer;
        }
        .mg-online-dot { position: absolute; right: 0; bottom: 1px; width: 10px; height: 10px; border: 2px solid #3964d7; background: #6ee29d; border-radius: 50%; }
        .mg-date { margin: 0 0 3px; font-size: 11px; letter-spacing: .02em; color: #cbdcff; }
        .mg-profile h1 { margin: 0; color: #fff; font-family: "Manrope", sans-serif; font-size: 20px; letter-spacing: -.04em; }
        .mg-notification {
          position: relative; display: grid; place-items: center; width: 42px; height: 42px; border-radius: 14px;
          color: #fff; background: rgba(255,255,255,.13); border: 1px solid rgba(255,255,255,.22); cursor: pointer;
        }
        .mg-notification.is-open { background: rgba(255,255,255,.28); }
        .mg-notification-count { position: absolute; right: -5px; top: -7px; min-width: 21px; height: 21px; display: grid; place-items: center; padding: 0 4px; border-radius: 99px; background: #f36d58; border: 2px solid #3964d7; font: 700 10px "Manrope", sans-serif; }
        .mg-role-switch {
          position: absolute; z-index: 2; left: 20px; bottom: 15px; display: flex; gap: 3px; padding: 3px;
          border: 1px solid rgba(255,255,255,.2); border-radius: 11px; background: rgba(16,38,106,.28);
        }
        .mg-role-switch button { padding: 6px 10px; border-radius: 8px; color: #cfe0ff; background: transparent; font-size: 11px; cursor: pointer; }
        .mg-role-switch button.is-active { color: #22387f; background: #fff; box-shadow: 0 3px 10px rgba(16,32,92,.17); font-weight: 700; }
        .mg-notice-popover { position: absolute; z-index: 5; right: 18px; top: 72px; width: 252px; display: flex; gap: 9px; align-items: flex-start; padding: 12px; border: 1px solid rgba(54,86,164,.12); border-radius: 15px; color: #19223b; background: #fff; box-shadow: 0 12px 32px rgba(27,45,94,.18); }
        .mg-notice-popover:before { content: ""; position: absolute; right: 17px; top: -6px; width: 11px; height: 11px; background: #fff; transform: rotate(45deg); border-left: 1px solid rgba(54,86,164,.08); border-top: 1px solid rgba(54,86,164,.08); }
        .mg-notice-mark { width: 28px; height: 28px; display: grid; place-items: center; flex: 0 0 auto; color: #3964d7; border-radius: 9px; background: #e8f0ff; }
        .mg-notice-popover strong { display: block; font: 700 12px "Manrope", sans-serif; }
        .mg-notice-popover p { margin: 3px 0 0; color: #768198; font-size: 11px; line-height: 1.35; }
        .mg-notice-popover button { margin-left: auto; color: #9aa4b8; background: transparent; cursor: pointer; }
        .mg-content { position: relative; z-index: 1; padding: 0 20px 106px; }
        .mg-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 9px; padding: 12px 10px 11px; margin: -18px 0 20px; border-radius: 19px; background: #fff; box-shadow: 0 10px 28px rgba(47,65,105,.13); }
        .mg-stat { min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 1px 0; }
        .mg-stat-icon { width: 31px; height: 31px; display: grid; place-items: center; margin-bottom: 3px; border-radius: 10px; }
        .mg-stat strong { font: 800 19px "Manrope", sans-serif; letter-spacing: -.04em; }
        .mg-stat > span:last-child { color: #8994a8; font-size: 10px; white-space: nowrap; }
        .mg-tone-blue { color: #3b67d6; background: #e9f0ff; }
        .mg-tone-yellow { color: #d89b20; background: #fff3d8; }
        .mg-tone-mint { color: #2aa77b; background: #e3f8ef; }
        .mg-tone-gold { color: #c68b12; background: #fff5c9; }
        .mg-tone-rose { color: #e2646a; background: #ffeaec; }
        .mg-tone-orange { color: #df7a35; background: #fff0e2; }
        .mg-tone-violet { color: #8561c8; background: #f0eaff; }
        .mg-tone-sky { color: #2c8fc2; background: #e5f5ff; }
        .mg-tone-emerald { color: #238e6b; background: #e5f7ee; }
        .mg-tone-indigo { color: #5d65c7; background: #ececff; }
        .mg-next-action { position: relative; min-height: 150px; display: flex; justify-content: space-between; gap: 8px; overflow: hidden; margin-bottom: 26px; padding: 18px 17px; border-radius: 20px; background: #19294c; color: #fff; box-shadow: 0 12px 20px rgba(31,50,91,.15); }
        .mg-next-action:after { content: ""; position: absolute; right: -42px; bottom: -74px; width: 176px; height: 176px; border: 1px solid rgba(125,189,255,.22); border-radius: 50%; box-shadow: 0 0 0 19px rgba(125,189,255,.05), 0 0 0 38px rgba(125,189,255,.04); }
        .mg-next-copy { position: relative; z-index: 1; }
        .mg-eyebrow, .mg-kicker { display: flex; align-items: center; gap: 5px; margin: 0; color: #87b5fa; font: 700 9px "Manrope", sans-serif; letter-spacing: .13em; }
        .mg-next-action h2 { max-width: 200px; margin: 5px 0 3px; font: 700 18px "Manrope", sans-serif; letter-spacing: -.04em; }
        .mg-next-action p { max-width: 205px; margin: 0; color: #b4c4e5; font-size: 11px; line-height: 1.35; }
        .mg-primary-action { display: inline-flex; align-items: center; gap: 7px; margin-top: 12px; padding: 8px 11px; border-radius: 9px; color: #203462; background: #bde1ff; font: 700 11px "DM Sans", sans-serif; cursor: pointer; }
        .mg-primary-action:hover { background: #d6edff; }
        .mg-progress-ring { position: relative; z-index: 1; align-self: center; width: 70px; height: 70px; display: grid; place-items: center; margin-right: 4px; border-radius: 50%; background: radial-gradient(circle at center, #19294c 57%, transparent 58%), conic-gradient(#8cd6ff 0 25%, rgba(255,255,255,.14) 25% 100%); }
        .mg-progress-ring:before { content: ""; position: absolute; inset: 5px; border: 1px solid rgba(255,255,255,.12); border-radius: 50%; }
        .mg-progress-ring span { font: 800 17px "Manrope", sans-serif; }
        .mg-progress-ring small { font-size: 9px; color: #a6caef; }
        .mg-section { margin-bottom: 27px; }
        .mg-section-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
        .mg-section-heading h2 { margin: 3px 0 0; font: 800 19px "Manrope", sans-serif; letter-spacing: -.05em; }
        .mg-kicker { color: #8998b1; font-size: 9px; letter-spacing: .16em; }
        .mg-kicker-coral { color: #db806b; }
        .mg-heading-note { color: #9aa6b8; font-size: 10px; }
        .mg-shortcuts { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 9px; }
        .mg-shortcut { min-width: 0; min-height: 88px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 8px 3px; border: 1px solid #e9edf3; border-radius: 15px; background: #fff; color: #28334b; box-shadow: 0 5px 12px rgba(47,65,105,.04); cursor: pointer; }
        .mg-shortcut:hover { transform: translateY(-2px); box-shadow: 0 9px 16px rgba(47,65,105,.09); }
        .mg-shortcut-icon { width: 38px; height: 38px; display: grid; place-items: center; border-radius: 12px; }
        .mg-shortcut-label { width: 100%; min-height: 24px; display: block; overflow: hidden; text-align: center; font-size: 10px; line-height: 1.2; }
        .mg-expand { display: flex; align-items: center; justify-content: center; gap: 5px; width: 100%; margin-top: 10px; padding: 7px; border: 1px dashed #cbd6e7; border-radius: 10px; color: #4e73c8; background: transparent; font-size: 11px; cursor: pointer; }
        .mg-rotate { transform: rotate(180deg); }
        .mg-text-button { display: inline-flex; align-items: center; gap: 2px; padding: 0; color: #3f6ccc; background: transparent; font-size: 11px; cursor: pointer; }
        .mg-count { display: inline-grid; place-items: center; min-width: 22px; height: 21px; margin-left: 4px; padding: 0 5px; border-radius: 99px; color: #fff; background: #ed7666; font: 700 10px "Manrope", sans-serif; vertical-align: 2px; }
        .mg-promo-section { margin-bottom: 27px; }
        .mg-promo { position: relative; isolation: isolate; width: 100%; min-height: 145px; display: flex; justify-content: space-between; overflow: hidden; padding: 18px 16px; border-radius: 19px; text-align: left; color: #fff; background: linear-gradient(125deg, #d95049 0%, #ed765d 58%, #f2ae66 100%); box-shadow: 0 10px 18px rgba(215,91,75,.18); cursor: pointer; }
        .mg-promo:before { content: ""; position: absolute; z-index: -1; inset: 0; opacity: .28; background: radial-gradient(circle at 89% 14%, #ffe0a1 0 2px, transparent 3px), radial-gradient(circle at 76% 60%, #ffe0a1 0 1px, transparent 2px), radial-gradient(circle at 56% 8%, #fff 0 1px, transparent 2px); background-size: 39px 31px, 25px 26px, 32px 37px; }
        .mg-promo-copy { position: relative; z-index: 1; }
        .mg-promo-tag { display: inline-block; padding: 4px 7px; border-radius: 5px; color: #ffe6bd; background: rgba(120,37,47,.36); font: 800 8px "Manrope", sans-serif; letter-spacing: .13em; }
        .mg-promo strong { display: block; max-width: 184px; margin: 9px 0 4px; font: 800 20px/1.04 "Manrope", sans-serif; letter-spacing: -.06em; }
        .mg-promo p { margin: 0; color: #ffe8d2; font-size: 10px; }
        .mg-promo-link { display: flex; align-items: center; gap: 4px; margin-top: 12px; font-size: 10px; font-weight: 700; }
        .mg-promo-token { align-self: center; display: flex; flex-direction: column; align-items: center; justify-content: center; width: 78px; height: 78px; margin: 8px 0 0 5px; border: 1px dashed rgba(255,240,204,.68); border-radius: 50%; color: #fff5dd; transform: rotate(8deg); }
        .mg-promo-token span { font-size: 12px; line-height: 1; }
        .mg-promo-token strong { margin: 0; font: 800 25px/1 "Manrope", sans-serif; letter-spacing: -.06em; }
        .mg-promo-token small { font-size: 9px; }
        .mg-promo-spark { position: absolute; width: 8px; height: 8px; border: 2px solid #ffe6a7; transform: rotate(45deg); }
        .spark-a { top: 19px; right: 108px; }
        .spark-b { bottom: 20px; right: 95px; width: 5px; height: 5px; border-width: 1px; }
        .mg-news-section { margin-bottom: 9px; }
        .mg-news-list { display: flex; flex-direction: column; gap: 9px; }
        .mg-news-card { position: relative; display: flex; align-items: center; gap: 11px; min-height: 84px; padding: 9px 10px 9px 9px; border: 1px solid #e8edf4; border-radius: 16px; text-align: left; background: #fff; color: #19223b; box-shadow: 0 5px 12px rgba(47,65,105,.035); cursor: pointer; }
        .mg-news-card:hover { border-color: #cbd8f1; transform: translateY(-1px); }
        .mg-news-visual { width: 65px; height: 65px; display: flex; flex-direction: column; align-items: center; justify-content: center; flex: 0 0 auto; gap: 4px; border-radius: 12px; }
        .mg-news-visual span { font: 800 9px "Manrope", sans-serif; letter-spacing: .06em; }
        .mg-news-blue { color: #416ccf; background: #e9f0ff; }
        .mg-news-coral { color: #d96e5a; background: #ffebe6; }
        .mg-news-body { min-width: 0; padding-right: 14px; }
        .mg-pinned { display: flex; align-items: center; gap: 3px; margin-bottom: 3px; color: #d3942c; font: 700 9px "DM Sans", sans-serif; }
        .mg-news-body strong { display: block; overflow: hidden; font: 700 12px/1.25 "Manrope", sans-serif; text-overflow: ellipsis; white-space: nowrap; }
        .mg-news-body p { overflow: hidden; margin: 3px 0; color: #758198; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
        .mg-news-body small { color: #a2abba; font-size: 9px; }
        .mg-news-arrow { position: absolute; right: 10px; color: #aab5c5; }
        .mg-bottom-nav { position: absolute; z-index: 6; right: 0; bottom: 0; left: 0; display: grid; grid-template-columns: repeat(6, 1fr); padding: 9px 7px 10px; border-top: 1px solid #e9edf3; background: rgba(255,255,255,.96); backdrop-filter: blur(14px); }
        .mg-nav-item { position: relative; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 3px 0; color: #909bad; background: transparent; font-size: 9px; cursor: pointer; }
        .mg-nav-item.is-active { color: #3f6fd5; font-weight: 700; }
        .mg-nav-icon { position: relative; display: grid; place-items: center; min-height: 20px; }
        .mg-chat-badge { position: absolute; top: -7px; right: -11px; min-width: 17px; height: 17px; display: grid; place-items: center; padding: 0 3px; border: 2px solid #fff; border-radius: 99px; color: #fff; background: #ed7666; font: 700 8px "Manrope", sans-serif; }
        .mg-toast { position: fixed; z-index: 20; left: 50%; bottom: 87px; max-width: 300px; padding: 10px 14px; border: 1px solid rgba(255,255,255,.45); border-radius: 12px; color: #fff; background: rgba(25,41,76,.94); box-shadow: 0 10px 25px rgba(20,32,67,.22); font-size: 11px; transform: translateX(-50%); animation: mg-rise .22s ease-out both; }
        @keyframes mg-rise { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }
        @media (min-width: 720px) {
          .mg-stage { padding: 34px 20px; }
          .mg-phone { min-height: calc(100vh - 68px); border: 8px solid #d9e1ed; border-radius: 30px; }
          .mg-hero { border-radius: 20px 20px 0 0; }
          .mg-bottom-nav { border-radius: 0 0 20px 20px; }
        }
        @media (max-width: 355px) {
          .mg-content { padding-right: 14px; padding-left: 14px; }
          .mg-hero { padding-right: 14px; padding-left: 14px; }
          .mg-shortcuts { gap: 5px; }
          .mg-shortcut-label { font-size: 9px; }
          .mg-stats { gap: 4px; }
        }
      `}</style>
    </div>
  );
}

export default ModernGradient;