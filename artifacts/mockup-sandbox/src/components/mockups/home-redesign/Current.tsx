import {
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  FileText,
  Gift,
  Home,
  Menu,
  MessageCircle,
  NotebookTabs,
  Star,
  X,
} from "lucide-react";
import { useState } from "react";
import "./_group.css";

type Shortcut = {
  label: string;
  icon: React.ReactNode;
  tone: string;
  color: string;
};

const shortcuts: Shortcut[] = [
  { label: "Lịch học", icon: <CalendarDays />, tone: "#eef5ff", color: "#2e74d6" },
  { label: "BTVN", icon: <BookOpen />, tone: "#fff4cb", color: "#c58b00" },
  { label: "Bảng điểm", icon: <BarChart3 />, tone: "#e9f8ef", color: "#23a15c" },
  { label: "Hoá đơn", icon: <FileText />, tone: "#fff9bd", color: "#c78e00" },
  { label: "Xin nghỉ", icon: <X />, tone: "#fff0f0", color: "#e45b5b" },
];

const news = [
  { category: "Thông báo", title: "EasyEdu đồng hành cùng học viên trên hành trình mới", author: "EasyEdu", tint: "linear-gradient(135deg,#98b6c9,#d8c7a8)", pinned: true },
  { category: "Hoạt động", title: "Cùng tham gia những hoạt động thú vị tại trung tâm", author: "EasyEdu", tint: "linear-gradient(135deg,#dfb9a7,#8e8091)", pinned: true },
];

function Stat({
  icon,
  value,
  label,
  color,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  color: string;
}) {
  return (
    <div className="home-stat">
      <div className="home-stat-icon" style={{ color, background: `${color}18` }}>{icon}</div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

export function Current() {
  const [active, setActive] = useState("Trang chủ");
  // The real screen swaps these three values for parent/staff accounts. Student
  // is the default account represented in the supplied reference capture.
  const roleStats = {
    student: [
      { icon: <BookOpen />, value: "0", label: "Lớp học", color: "#2d72d5" },
      { icon: <CheckCircle2 />, value: "1/4", label: "BT xong", color: "#35b879" },
      { icon: <Star />, value: "34", label: "Điểm sao", color: "#e7a520" },
    ],
    parent: [
      { icon: <NotebookTabs />, value: "2", label: "Học viên", color: "#2d72d5" },
      { icon: <BookOpen />, value: "4", label: "Lớp học", color: "#35b879" },
      { icon: <CheckCircle2 />, value: "18", label: "Buổi đã học", color: "#e7a520" },
    ],
    staff: [
      { icon: <BookOpen />, value: "6", label: "Lớp học", color: "#2d72d5" },
      { icon: <CheckCircle2 />, value: "8/12", label: "Công việc", color: "#35b879" },
      { icon: <Star />, value: "16/20", label: "Đã dạy", color: "#e7a520" },
    ],
  } as const;

  return (
    <div className="home-redesign-frame">
      <style>{`
        .home-shell{width:100%;max-width:480px;min-height:100vh;margin:auto;background:#f5f4fc;color:#17182a;font-family:Inter,system-ui,sans-serif;overflow:hidden;position:relative;padding-bottom:76px}
        .home-hero{height:112px;background:#6c63ff;color:white;padding:22px 20px 0}
        .home-head{display:flex;align-items:center;justify-content:space-between}
        .home-user{display:flex;align-items:center;gap:12px}.home-avatar{width:48px;height:48px;border:2.5px solid #d9d6ff;border-radius:50%;background:#8279fb;display:grid;place-items:center;font-weight:700;font-size:18px;position:relative}.home-avatar:after{content:"";width:11px;height:11px;position:absolute;right:-2px;bottom:-1px;background:#46d578;border:2px solid #6c63ff;border-radius:50%}
        .home-date{font-size:13px;opacity:.8;margin-bottom:2px}.home-greeting{font-size:20px;font-weight:700}.home-bell{height:48px;width:48px;border:1px solid #958eff;border-radius:50%;display:grid;place-items:center;position:relative;background:#7c73fa;color:#fff}.home-badge{position:absolute;right:-1px;top:-2px;border:2px solid #fff;background:#e94752;border-radius:12px;padding:1px 5px;font-size:10px;font-weight:800}
        .home-stats{display:flex;gap:9px;margin:-20px 16px 0;padding:13px;background:#efedf8;border-radius:18px;position:relative;box-shadow:0 3px 10px #28205412}.home-stat{background:#fff;border:1px solid #e7e4ed;border-radius:14px;flex:1;text-align:center;padding:14px 4px 12px;min-width:0}.home-stat-icon{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;margin:0 auto 6px}.home-stat-icon svg{width:21px;height:21px;stroke-width:2}.home-stat strong{display:block;font-size:21px;line-height:27px}.home-stat span{display:block;color:#777889;font-size:11px;margin-top:3px}
        .home-content{padding-top:25px}.home-section{margin:0 20px 24px}.home-title{font-size:18px;font-weight:700;margin:0 0 12px}.home-shortcuts{display:flex;gap:10px;overflow:visible}.home-shortcut{width:94px;flex:none;background:#fff;border:1px solid #e9e7ee;border-radius:15px;padding:17px 4px 15px;text-align:center;box-shadow:0 3px 7px #26213d0c}.home-shortcut-icon{width:50px;height:50px;border-radius:15px;margin:0 auto 9px;display:grid;place-items:center}.home-shortcut-icon svg{width:23px;height:23px}.home-shortcut span{font-size:12px;white-space:nowrap}
        .home-promo-head,.home-news-head{display:flex;justify-content:space-between;align-items:center}.home-promo-title{display:flex;align-items:center;gap:7px}.home-gift{font-size:19px}.home-count{font-size:12px;background:#2469d8;color:#fff;border-radius:12px;padding:3px 8px}.home-carousel{display:flex;gap:12px;overflow:hidden}.home-promo{flex:0 0 398px;background:#fff;border-radius:16px;border:1px solid #e5e3ea;overflow:hidden}.home-promo-art{height:194px;background:radial-gradient(circle at 80% 25%,#f8d96f 0 7%,transparent 8%),linear-gradient(130deg,#d84626,#9f0711 65%,#e8891c);color:#fff;text-align:center;padding:17px 10px 0;font-weight:800;text-shadow:1px 2px #8e1610}.home-promo-art b{font-size:22px;display:block;line-height:1.05}.home-promo-art strong{font-size:27px;display:block;margin-top:15px;color:#ffe533}.home-promo-art small{display:block;background:#f4c42d;color:#852114;text-shadow:none;border-radius:9px;width:max-content;margin:11px auto;padding:3px 14px;font-size:10px}.home-promo-footer{padding:10px 13px;font-size:14px}.home-see{font-size:13px;color:#2c68c8}.home-news{display:flex;gap:12px;overflow:hidden}.home-news-card{flex:0 0 208px;background:#fff;border:1px solid #e6e4eb;border-radius:15px;overflow:hidden}.home-news-art{height:96px}.home-news-body{padding:9px}.home-cat{font-size:10px;color:#e9ad2c;font-weight:700}.home-news-copy{font-size:12px;line-height:17px;margin:5px 0 11px}.home-author{font-size:10px;color:#858594}.home-bottom{position:fixed;bottom:0;left:50%;transform:translateX(-50%);max-width:480px;width:100%;height:76px;background:#fafaff;border-top:1px solid #e3e2ea;display:flex;justify-content:space-around;padding-top:10px;z-index:3}.home-nav{border:0;background:none;color:#737485;font-size:10px;display:flex;flex-direction:column;align-items:center;gap:4px;min-width:48px}.home-nav svg{width:21px;height:21px}.home-nav.active{color:#2e70d4;font-weight:600}.home-nav.chat{position:relative}.home-chat-badge{position:absolute;top:-5px;right:2px;background:#ed4e57;color:#fff;border-radius:10px;font-size:10px;padding:2px 5px}
        @media(max-width:430px){.home-promo{flex-basis:calc(100vw - 42px)}.home-shortcut{width:94px}.home-news-card{flex-basis:calc((100vw - 52px)/2)}}
      `}</style>
      <div className="home-shell">
        <header className="home-hero">
          <div className="home-head">
            <div className="home-user"><div className="home-avatar">H</div><div><div className="home-date">Thứ tư, 16 Tháng 9</div><div className="home-greeting">Chào, Học viên 1!</div></div></div>
            <button className="home-bell" aria-label="Thông báo"><Bell size={22}/><span className="home-badge">99+</span></button>
          </div>
        </header>
        <section className="home-stats">{roleStats.student.map((stat) => <Stat key={stat.label} {...stat} />)}</section>
        <main className="home-content">
          <section className="home-section"><h2 className="home-title">Lối tắt</h2><div className="home-shortcuts">{shortcuts.map((item) => <button className="home-shortcut" key={item.label}><div className="home-shortcut-icon" style={{ background: item.tone, color: item.color }}>{item.icon}</div><span>{item.label}</span></button>)}</div></section>
          <section className="home-section"><div className="home-promo-head"><h2 className="home-title home-promo-title"><span className="home-gift">🎁</span>Khuyến mãi <span className="home-count">2</span></h2></div><div className="home-carousel"><article className="home-promo"><div className="home-promo-art"><b>ƯU ĐÃI VÀNG<br/>BẤT NGỜ QUÀ TẶNG</b><strong>1 TRIỆU ĐỒNG</strong><small>ĐĂNG KÝ NGAY</small></div><div className="home-promo-footer">Khi trường tưng bừng quà tặng</div></article><article className="home-promo"><div className="home-promo-art" style={{background:"linear-gradient(130deg,#e95046,#c32b72)"}}><b>ƯU ĐÃI ĐẶC BIỆT</b><strong>HỌC VUI MỖI NGÀY</strong></div><div className="home-promo-footer">Cơ hội học tập mới</div></article></div></section>
          <section className="home-section"><div className="home-news-head"><h2 className="home-title">Bảng tin</h2><span className="home-see">Xem tất cả</span></div><div className="home-news">{news.map((item) => <article className="home-news-card" key={item.title}><div className="home-news-art" style={{background:item.tint}}/><div className="home-news-body">{item.pinned && <div className="home-cat">🔖 Đã ghim</div>}<div className="home-news-copy">{item.title}</div><div className="home-author">{item.author} · 2 giờ trước</div></div></article>)}</div></section>
        </main>
        <nav className="home-bottom">{[{label:"Trang chủ",icon:<Home/>},{label:"Lịch",icon:<CalendarDays/>},{label:"BTVN",icon:<NotebookTabs/>},{label:"Bảng điểm",icon:<BarChart3/>},{label:"Chat",icon:<MessageCircle/>,badge:true},{label:"Menu",icon:<Menu/>}].map((item)=><button key={item.label} className={`home-nav ${active===item.label?"active":""} ${item.badge?"chat":""}`} onClick={()=>setActive(item.label)}>{item.icon}{item.badge&&<span className="home-chat-badge">3</span>}<span>{item.label}</span></button>)}</nav>
      </div>
    </div>
  );
}

export default Current;