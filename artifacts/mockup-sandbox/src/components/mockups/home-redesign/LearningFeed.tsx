import "./_group.css";
import "./LearningFeed.css";
import {
  Bell,
  BookOpen,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  FileText,
  Flag,
  GraduationCap,
  LayoutDashboard,
  Menu,
  MessageCircle,
  Pin,
  ReceiptText,
  ShieldAlert,
  Sparkles,
  Star,
  UsersRound,
  WalletCards,
  XCircle,
} from "lucide-react";
import { useState } from "react";

type IconType = typeof CalendarDays;

const studentShortcuts: { label: string; icon: IconType; tint: string; color: string }[] = [
  { label: "Lịch học", icon: CalendarDays, tint: "#e3edff", color: "#4e78d7" },
  { label: "BTVN", icon: BookOpen, tint: "#fff0c8", color: "#bd8328" },
  { label: "Bảng điểm", icon: GraduationCap, tint: "#dff4e9", color: "#388d6a" },
  { label: "Hoá đơn", icon: ReceiptText, tint: "#fff3c5", color: "#ad7c16" },
  { label: "Xin nghỉ", icon: XCircle, tint: "#ffe4df", color: "#d56c63" },
];

const staffShortcuts: { label: string; icon: IconType; tint: string; color: string; extra?: boolean }[] = [
  { label: "Bài tập / Kiểm tra", icon: FileText, tint: "#e3edff", color: "#4e78d7" },
  { label: "HV sắp hết lịch", icon: CalendarDays, tint: "#fff0df", color: "#c7774d" },
  { label: "Bảng điểm", icon: GraduationCap, tint: "#dff4e9", color: "#388d6a" },
  { label: "Lớp sắp kết thúc", icon: Flag, tint: "#eee7ff", color: "#7964c8" },
  { label: "Lương đứng lớp", icon: BriefcaseBusiness, tint: "#e3edff", color: "#4e78d7", extra: true },
  { label: "Hoá đơn", icon: ReceiptText, tint: "#fff3c5", color: "#ad7c16", extra: true },
  { label: "Xin nghỉ", icon: ShieldAlert, tint: "#ffe4df", color: "#d56c63", extra: true },
  { label: "Tổng lương", icon: WalletCards, tint: "#dff4e9", color: "#388d6a", extra: true },
  { label: "Dashboard", icon: LayoutDashboard, tint: "#eee7ff", color: "#7964c8", extra: true },
];

function ShortcutButton({ item }: { item: (typeof studentShortcuts)[number] }) {
  const Icon = item.icon;
  return (
    <button className="shortcut" type="button" onClick={() => undefined} aria-label={item.label}>
      <span className="shortcut-icon" style={{ background: item.tint, color: item.color }}>
        <Icon size={17} strokeWidth={2} />
      </span>
      <span className="shortcut-label">{item.label}</span>
    </button>
  );
}

function Stat({ icon: Icon, label, value, tint, color }: { icon: IconType; label: string; value: string; tint: string; color: string }) {
  return (
    <div className="stat">
      <span className="stat-icon" style={{ background: tint, color }}>
        <Icon size={16} strokeWidth={2.2} />
      </span>
      <strong className="stat-value">{value}</strong>
      <span className="stat-label">{label}</span>
    </div>
  );
}

function TodaySchedule({ staffMode }: { staffMode: boolean }) {
  const sessions = staffMode
    ? [
        { start: "18:30", end: "20:00", name: "IELTS Foundation", place: "Phòng 204", detail: "12 học viên · 2 chờ điểm danh", mode: "Offline" },
        { start: "20:15", end: "21:45", name: "TOEIC Target", place: "Phòng 301", detail: "8 học viên", mode: "Offline" },
      ]
    : [
        { start: "17:30", end: "19:00", name: "IELTS Foundation", place: "Phòng 204", detail: "Cô Mai · Chưa điểm danh", mode: "Offline" },
        { start: "19:15", end: "20:45", name: "Speaking Club", place: "Phòng học trực tuyến", detail: "Thầy Nam · Sắp học", mode: "Online" },
      ];

  return (
    <section className="section-block schedule-block">
      <div className="section-head">
        <h2 className="section-title">Lịch học hôm nay <span className="schedule-count">{sessions.length}</span></h2>
        <button className="section-note" type="button" onClick={() => undefined}>Xem lịch</button>
      </div>
      <div className="schedule-list">
        {sessions.map((session) => (
          <article className="schedule-item" key={`${session.start}-${session.name}`}>
            <div className="schedule-time">
              <strong>{session.start}</strong>
              <span>{session.end}</span>
            </div>
            <div className="schedule-copy">
              <div className="schedule-title-row">
                <h3>{session.name}</h3>
                <ChevronRight size={15} />
              </div>
              <p><Clock3 size={11} /> {session.place}</p>
              <div className="schedule-meta">
                <span>{session.detail}</span>
                <span className={`mode-pill ${session.mode === "Online" ? "online" : ""}`}>{session.mode}</span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function LearningFeed() {
  const [staffMode, setStaffMode] = useState(false);
  const [staffExpanded, setStaffExpanded] = useState(false);
  const [unread, setUnread] = useState(3);

  return (
    <main className="learning-shell">
      <div className="learning-frame">
        <header className="feed-top">
          <div className="feed-top-row">
            <div className="hello-row">
              <div className="avatar" aria-label="Ảnh đại diện học viên">H</div>
              <div>
                <p className="date-kicker">Thứ Tư, 16 Tháng 9</p>
                <h1 className="greeting">Chào, Học viên 1!</h1>
              </div>
            </div>
            <button className="notification-button" type="button" onClick={() => setUnread(0)} aria-label="Thông báo chưa đọc">
              <Bell size={21} strokeWidth={1.8} />
              {unread > 0 && <span className="notification-badge">{unread > 9 ? "9+" : unread}</span>}
            </button>
          </div>
          <div className="today-strip">
            <div>
              <strong>{staffMode ? "Một ngày thật gọn cho đội ngũ" : "Hôm nay có gì mới?"}</strong>
              <span>{staffMode ? "4 lớp cần bạn để ý" : "Bạn đang có 1 việc cần hoàn thành"}</span>
            </div>
            <div className="today-progress"><b>{staffMode ? "4" : "1/4"}</b><br /><span>{staffMode ? "việc mới" : "BTVN xong"}</span></div>
          </div>
        </header>

        <section className="stats-wrap" aria-label="Tổng quan tiến độ">
          <div className="stats-row">
            {staffMode ? (
              <>
                <Stat icon={BookOpen} label="Lớp học" value="8" tint="#e3edff" color="#4e78d7" />
                <Stat icon={Check} label="Công việc" value="6/9" tint="#dff4e9" color="#388d6a" />
                <Stat icon={Star} label="Đã dạy" value="12/16" tint="#fff0c8" color="#bd8328" />
              </>
            ) : (
              <>
                <Stat icon={BookOpen} label="Lớp học" value="0" tint="#e3edff" color="#4e78d7" />
                <Stat icon={Check} label="BT xong" value="1/4" tint="#dff4e9" color="#388d6a" />
                <Stat icon={Star} label="Điểm sao" value="34" tint="#fff0c8" color="#bd8328" />
              </>
            )}
          </div>
        </section>

        <div className="feed-content">
          <section className="section-block">
            <div className="section-head">
              <h2 className="section-title">Đang diễn ra</h2>
              <button className="section-note" type="button" onClick={() => undefined}>Xem lịch hôm nay</button>
            </div>
            <article className="now-card">
              <span className="eyebrow">{staffMode ? "Sắp bắt đầu" : "Việc tiếp theo"}</span>
              <h3 className="now-title">{staffMode ? "Lớp IELTS Foundation · Phòng 204" : "Nộp bài Reading Unit 3"}</h3>
              <p className="now-copy">{staffMode ? "Còn 35 phút nữa · 12 học viên đã xác nhận" : "Bài tập tiếng Anh của cô Mai đang chờ bạn hoàn thành."}</p>
              <div className="now-foot">
                <span className="now-time">{staffMode ? "18:30 — 20:00" : "Hạn 20:00 hôm nay"}</span>
                <button className="tiny-link" type="button" onClick={() => undefined}>Mở ngay <ChevronRight size={12} /></button>
              </div>
            </article>
          </section>

          <TodaySchedule staffMode={staffMode} />

          <section className="section-block">
            <div className="section-head">
              <h2 className="section-title">{staffMode ? "Lối tắt công việc" : "Lối tắt"}</h2>
              {!staffMode && <button className="section-note" type="button" onClick={() => setStaffMode(true)}>Chế độ nhân sự</button>}
            </div>
            {!staffMode ? (
              <div className="shortcut-scroller">
                {studentShortcuts.map((item) => <ShortcutButton item={item} key={item.label} />)}
              </div>
            ) : (
              <>
                <div className={`staff-grid ${staffExpanded ? "expanded" : ""}`}>
                  {staffShortcuts.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button className={`shortcut staff-shortcut ${item.extra ? "staff-extra" : ""}`} type="button" onClick={() => undefined} key={item.label}>
                        <span className="shortcut-icon" style={{ background: item.tint, color: item.color }}><Icon size={16} strokeWidth={2} /></span>
                        <span className="shortcut-label">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
                <button className="expand-staff" type="button" onClick={() => setStaffExpanded((value) => !value)}>
                  {staffExpanded ? "Thu gọn" : "Xem thêm hành chính"}
                </button>
              </>
            )}
          </section>

          <section className="section-block">
            <div className="section-head">
              <h2 className="section-title">Khuyến mãi <span className="promo-count">2</span></h2>
              <button className="section-note" type="button" onClick={() => undefined}>Xem tất cả</button>
            </div>
            <article className="promo-card">
              <div className="promo-art"><Sparkles size={27} strokeWidth={1.6} /></div>
              <div className="promo-copy">
                <span className="promo-tag">Ưu đãi tháng 9</span>
                <h3 className="promo-title">Khi trưởng thành cũng cần quà tặng</h3>
                <p className="promo-description">Đăng ký ngay để nhận ưu đãi học phí đến 300.000đ cho lộ trình mới.</p>
              </div>
            </article>
          </section>

          <section className="section-block">
            <div className="section-head">
              <h2 className="section-title">Bảng tin</h2>
              <button className="section-note" type="button" onClick={() => undefined}>Xem tất cả</button>
            </div>
            <div className="news-list">
              <article className="news-item" onClick={() => undefined}>
                <div className="news-mark"><Pin size={17} /></div>
                <div className="news-copy"><p className="news-title">Lịch nghỉ lễ Quốc khánh 2/9 và lịch học bù</p><span className="news-author">Phòng đào tạo · 2 giờ trước</span></div>
                <Pin className="pin" size={13} />
              </article>
              <article className="news-item" onClick={() => undefined}>
                <div className="news-mark"><UsersRound size={17} /></div>
                <div className="news-copy"><p className="news-title">Workshop: Cùng con xây thói quen tự học</p><span className="news-author">EasyEdu Community · Hôm qua</span></div>
                <Pin className="pin" size={13} />
              </article>
              <article className="news-item" onClick={() => undefined}>
                <div className="news-mark"><MessageCircle size={17} /></div>
                <div className="news-copy"><p className="news-title">Cô Mai đã gửi nhận xét bài tập của bạn</p><span className="news-author">Lớp IELTS Foundation · 2 ngày trước</span></div>
              </article>
            </div>
          </section>
        </div>

        <nav className="bottom-nav" aria-label="Điều hướng chính">
          <button className="nav-item active" type="button" onClick={() => undefined}><span className="nav-glyph"><LayoutDashboard size={17} /></span>Trang chủ</button>
          <button className="nav-item" type="button" onClick={() => undefined}><span className="nav-glyph"><CalendarDays size={17} /></span>Lịch</button>
          <button className="nav-item" type="button" onClick={() => undefined}><span className="nav-glyph"><BookOpen size={17} /></span>BTVN</button>
          <button className="nav-item" type="button" onClick={() => undefined}><span className="nav-glyph"><GraduationCap size={17} /></span>Bảng điểm</button>
          <button className="nav-item" type="button" onClick={() => undefined}><span className="nav-glyph"><MessageCircle size={17} /></span>Chat</button>
          <button className="nav-item" type="button" onClick={() => undefined}><span className="nav-glyph"><Menu size={17} /></span>Menu</button>
        </nav>
      </div>
    </main>
  );
}