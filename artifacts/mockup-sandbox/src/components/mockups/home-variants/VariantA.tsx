import React from 'react';
import {
  Bell, Edit3, BarChart2, Briefcase, Calendar,
  Clock, Flag, FileText, DollarSign, BookOpen,
  ChevronRight, Info, AlertCircle, Layers, CheckCircle, Presentation
} from 'lucide-react';
import './_variantA.css';

const quickAccess = [
  { icon: Edit3,      label: "Bài tập / KT", color: "text-blue-500",    bg: "bg-blue-50",    shadow: "shadow-[0_4px_12px_rgba(59,130,246,0.18)]" },
  { icon: BarChart2,  label: "Bảng điểm",    color: "text-emerald-500", bg: "bg-emerald-50", shadow: "shadow-[0_4px_12px_rgba(16,185,129,0.18)]" },
  { icon: Briefcase,  label: "Lương lớp",    color: "text-cyan-500",    bg: "bg-cyan-50",    shadow: "shadow-[0_4px_12px_rgba(6,182,212,0.18)]"  },
  { icon: Calendar,   label: "Xin nghỉ",     color: "text-orange-500",  bg: "bg-orange-50",  shadow: "shadow-[0_4px_12px_rgba(249,115,22,0.18)]"  },
  { icon: Clock,      label: "HV sắp hết",   color: "text-amber-500",   bg: "bg-amber-50",   shadow: "shadow-[0_4px_12px_rgba(245,158,11,0.18)]"  },
  { icon: Flag,       label: "Lớp sắp KT",   color: "text-fuchsia-500", bg: "bg-fuchsia-50", shadow: "shadow-[0_4px_12px_rgba(217,70,239,0.18)]"  },
  { icon: FileText,   label: "Hoá đơn",      color: "text-yellow-600",  bg: "bg-yellow-50",  shadow: "shadow-[0_4px_12px_rgba(234,179,8,0.18)]"   },
  { icon: DollarSign, label: "Tổng lương",   color: "text-teal-500",    bg: "bg-teal-50",    shadow: "shadow-[0_4px_12px_rgba(20,184,166,0.18)]"  },
];

export function VariantA() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap');
        .va-root { font-family: 'Outfit', sans-serif; }
        .va-scroll::-webkit-scrollbar { display: none; }
        .va-scroll { -ms-overflow-style: none; scrollbar-width: none; }
        .va-glass {
          background: rgba(255,255,255,0.75);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255,255,255,0.6);
          box-shadow: 0 4px 16px rgba(0,0,0,0.06);
        }
        .va-schedule-card {
          background: linear-gradient(135deg, #f8f6ff 0%, #f0f4ff 100%);
          border: 1px solid rgba(108,99,255,0.12);
          box-shadow: 0 8px 24px rgba(108,99,255,0.10);
        }
      `}} />

      <div
        className="va-root relative mx-auto w-[390px] h-[844px] overflow-hidden rounded-[40px] border-[8px] border-[#111] shadow-2xl bg-[#f4f6fb]"
      >
        {/* Subtle bg blobs */}
        <div className="absolute top-[-80px] right-[-60px] w-[260px] h-[260px] rounded-full bg-[rgba(168,85,247,0.07)] blur-[70px] pointer-events-none z-0" />
        <div className="absolute bottom-[60px] left-[-40px] w-[200px] h-[200px] rounded-full bg-[rgba(6,182,212,0.06)] blur-[60px] pointer-events-none z-0" />

        <div className="va-scroll h-full w-full overflow-y-auto relative z-10">

          {/* ── HEADER (Variant C style) ── */}
          <div className="bg-gradient-to-br from-[#6c63ff] to-[#a855f7] pt-12 pb-20 px-6 rounded-b-[36px] shadow-[0_12px_32px_rgba(108,99,255,0.25)]">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <img
                    src="/__mockup/images/teacher-avatar.jpg"
                    alt="Giáo viên 1"
                    className="w-14 h-14 rounded-full object-cover border-[3px] border-white/80 shadow-md"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src =
                        'https://ui-avatars.com/api/?name=GV1&background=ffffff&color=6c63ff&size=56';
                    }}
                  />
                  <div className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 bg-emerald-400 rounded-full border-2 border-white" />
                </div>
                <div>
                  <p className="text-white/75 text-xs font-medium tracking-wide mb-0.5">Thứ Năm, 16 Tháng 7</p>
                  <h1 className="text-white text-[22px] font-bold tracking-tight leading-tight">Chào, Giáo viên 1!</h1>
                </div>
              </div>

              <button className="relative mt-1 p-2.5 bg-white/20 hover:bg-white/30 backdrop-blur-md rounded-full border border-white/20">
                <Bell className="w-6 h-6 text-white" />
                <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 bg-red-500 rounded-full flex items-center justify-center border-2 border-[#8b5dfb]">
                  <span className="text-[10px] font-bold text-white leading-none">27</span>
                </span>
              </button>
            </div>
          </div>

          {/* ── STAT CARDS — floating out of header ── */}
          <div className="px-5 -mt-10 relative z-20 mb-5">
            <div className="grid grid-cols-3 gap-3">
              {[
                { icon: Layers,       label: "Lớp học",  value: "33",    sub: "",   iconBg: "bg-indigo-50", iconColor: "text-indigo-500" },
                { icon: CheckCircle,  label: "Công việc",value: "0",     sub: "/6", iconBg: "bg-emerald-50",iconColor: "text-emerald-500" },
                { icon: Presentation, label: "Đã dạy",   value: "15",    sub: "/25",iconBg: "bg-purple-50", iconColor: "text-purple-500"  },
              ].map((s, i) => (
                <div key={i} className="bg-white rounded-[18px] p-3.5 shadow-[0_12px_24px_-6px_rgba(0,0,0,0.11)] border border-white/60 flex flex-col items-center text-center">
                  <div className={`w-9 h-9 rounded-full ${s.iconBg} flex items-center justify-center mb-2 ${s.iconColor}`}>
                    <s.icon className="w-4.5 h-4.5 w-[18px] h-[18px]" />
                  </div>
                  <span className="text-[20px] font-bold text-gray-800 leading-none mb-0.5">
                    {s.value}<span className="text-sm font-medium text-gray-400">{s.sub}</span>
                  </span>
                  <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{s.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── QUICK ACCESS ── */}
          <div className="px-5 mb-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-4 rounded-full bg-gradient-to-b from-[#6c63ff] to-[#a855f7]" />
              <h2 className="text-[14px] font-bold text-gray-800 tracking-tight uppercase">Học vụ - Hành chính</h2>
            </div>
            <div className="va-glass rounded-2xl p-4">
              <div className="grid grid-cols-4 gap-y-5 gap-x-2">
                {quickAccess.map((item, i) => (
                  <div key={i} className="flex flex-col items-center gap-1.5 cursor-pointer group">
                    <div className={`w-[54px] h-[54px] rounded-2xl ${item.bg} ${item.shadow} flex items-center justify-center ${item.color} transition-transform group-hover:scale-105 group-active:scale-95`}>
                      <item.icon size={22} strokeWidth={2.2} />
                    </div>
                    <span className="text-[10px] font-medium text-gray-500 text-center leading-tight px-0.5">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── NOTIFICATIONS CAROUSEL ── */}
          <div className="mb-5">
            <div className="px-5 mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-1 h-4 rounded-full bg-gradient-to-b from-[#6c63ff] to-[#a855f7]" />
                <h2 className="text-[14px] font-bold text-gray-800 uppercase tracking-tight">Thông báo mới</h2>
              </div>
              <button className="text-xs text-[#6c63ff] flex items-center font-semibold">
                Xem tất cả <ChevronRight size={14} />
              </button>
            </div>
            <div className="flex gap-3 overflow-x-auto va-scroll px-5 pb-3 pt-1">
              {[
                { border: "border-l-[#6c63ff]", iconBg: "bg-indigo-50", iconColor: "text-indigo-500", Icon: Info,         title: "Lịch học A32 - Thứ 5", sub: "14:00 - 16:00, Phòng 201" },
                { border: "border-l-pink-500",   iconBg: "bg-pink-50",   iconColor: "text-pink-500",   Icon: AlertCircle,  title: "Bài tập lớp B12",       sub: "Hạn nộp: 18/7/2025"      },
              ].map((n, i) => (
                <div key={i} className={`shrink-0 w-[270px] va-glass rounded-2xl p-4 border-l-4 ${n.border}`}>
                  <div className="flex items-start gap-3">
                    <div className={`p-2 ${n.iconBg} rounded-xl ${n.iconColor} flex-shrink-0`}>
                      <n.Icon size={16} />
                    </div>
                    <div>
                      <p className="font-semibold text-[13px] text-gray-800 leading-snug mb-0.5">{n.title}</p>
                      <p className="text-[11px] text-gray-500">{n.sub}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── TODAY SCHEDULE ── */}
          <div className="px-5 pb-10">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-4 rounded-full bg-gradient-to-b from-emerald-400 to-cyan-500" />
              <h2 className="text-[14px] font-bold text-gray-800 uppercase tracking-tight">Lịch học hôm nay</h2>
            </div>
            <div className="va-schedule-card rounded-2xl p-5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-28 h-28 bg-indigo-100/60 rounded-full blur-[30px] -mr-8 -mt-8 pointer-events-none" />
              <div className="flex justify-between items-start mb-4 relative z-10">
                <div>
                  <span className="inline-block px-2.5 py-1 bg-[#6c63ff]/10 border border-[#6c63ff]/20 text-[#6c63ff] text-[10px] font-bold rounded-lg uppercase tracking-wide mb-2">Đang diễn ra</span>
                  <h3 className="text-[22px] font-bold text-gray-800">Lớp A32</h3>
                </div>
                <div className="text-right">
                  <div className="text-[#6c63ff] font-bold text-base">14:00 - 16:00</div>
                  <div className="text-[11px] text-gray-400 mt-0.5">Phòng trực tuyến</div>
                </div>
              </div>
              <div className="flex items-center gap-3 bg-white/70 rounded-xl p-3 border border-white/80 relative z-10 shadow-sm">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#6c63ff] to-[#a855f7] flex items-center justify-center shadow-sm">
                  <BookOpen size={18} className="text-white" />
                </div>
                <div className="flex-1">
                  <div className="text-[10px] text-gray-400 font-medium">Sĩ số lớp</div>
                  <div className="font-bold text-sm text-gray-800">28/30 Học viên</div>
                </div>
                <button className="h-9 px-4 rounded-xl bg-gradient-to-r from-[#6c63ff] to-[#a855f7] text-white text-[13px] font-semibold shadow-sm">
                  Vào lớp
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
