import React from "react";
import {
  Bell,
  Edit3,
  BarChart2,
  Briefcase,
  Calendar,
  Clock,
  Flag,
  FileText,
  DollarSign,
  Layers,
  CheckCircle,
  Presentation,
  ChevronRight
} from "lucide-react";

export function VariantC() {
  return (
    <div className="relative w-[390px] h-[844px] bg-[#f8f9ff] overflow-y-auto overflow-x-hidden font-sans">
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        .variant-c-container {
          font-family: 'Inter', sans-serif;
        }
        /* Custom scrollbar for horizontal lists */
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}} />
      
      <div className="variant-c-container relative min-h-full pb-10">
        
        {/* Header - Purple/Indigo Gradient */}
        <div className="bg-gradient-to-br from-[#6c63ff] to-[#a855f7] pt-14 pb-24 px-6 rounded-b-[40px] shadow-[0_10px_30px_rgba(108,99,255,0.2)]">
          <div className="flex justify-between items-start mb-6">
            <div className="flex items-center gap-4">
              <div className="relative">
                <img 
                  src="/__mockup/images/teacher-avatar-c.jpg" 
                  alt="Giáo viên 1" 
                  className="w-14 h-14 rounded-full object-cover border-[3px] border-white shadow-md"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = 'https://ui-avatars.com/api/?name=Giáo+viên&background=ffffff&color=6c63ff';
                  }}
                />
                <div className="absolute bottom-0 right-0 w-4 h-4 bg-green-400 border-2 border-white rounded-full"></div>
              </div>
              <div>
                <p className="text-white/80 text-sm font-medium mb-0.5">Thứ Năm, 16 Tháng 7</p>
                <h1 className="text-white text-2xl font-bold tracking-tight">Chào, Giáo viên 1!</h1>
              </div>
            </div>
            
            <button className="relative p-2.5 bg-white/20 hover:bg-white/30 backdrop-blur-md rounded-full transition-colors mt-1">
              <Bell className="w-6 h-6 text-white" />
              <span className="absolute top-2 right-2.5 flex h-3 w-3 items-center justify-center rounded-full bg-red-500 ring-2 ring-[#8b5dfb]">
                <span className="text-[8px] font-bold text-white">27</span>
              </span>
            </button>
          </div>
        </div>

        {/* Stats Cards - Floating out of gradient */}
        <div className="px-5 -mt-16 relative z-10 mb-8">
          <div className="grid grid-cols-3 gap-3">
            {/* Stat 1 */}
            <div className="bg-white rounded-[20px] p-4 shadow-[0_12px_24px_-8px_rgba(0,0,0,0.12)] border border-white/50 flex flex-col items-center text-center transition-transform hover:-translate-y-1">
              <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center mb-3 text-indigo-500">
                <Layers className="w-5 h-5" />
              </div>
              <span className="text-2xl font-bold text-gray-800 leading-none mb-1">33</span>
              <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Lớp học</span>
            </div>
            
            {/* Stat 2 */}
            <div className="bg-white rounded-[20px] p-4 shadow-[0_12px_24px_-8px_rgba(0,0,0,0.12)] border border-white/50 flex flex-col items-center text-center transition-transform hover:-translate-y-1">
              <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center mb-3 text-emerald-500">
                <CheckCircle className="w-5 h-5" />
              </div>
              <span className="text-2xl font-bold text-gray-800 leading-none mb-1">0<span className="text-sm text-gray-400">/6</span></span>
              <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Công việc</span>
            </div>
            
            {/* Stat 3 */}
            <div className="bg-white rounded-[20px] p-4 shadow-[0_12px_24px_-8px_rgba(0,0,0,0.12)] border border-white/50 flex flex-col items-center text-center transition-transform hover:-translate-y-1">
              <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center mb-3 text-purple-500">
                <Presentation className="w-5 h-5" />
              </div>
              <span className="text-2xl font-bold text-gray-800 leading-none mb-1">15<span className="text-sm text-gray-400">/25</span></span>
              <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Đã dạy</span>
            </div>
          </div>
        </div>

        {/* Quick Access Grid */}
        <div className="px-6 mb-8">
          <h2 className="text-[17px] font-bold text-gray-900 mb-4 tracking-tight">Học vụ - Hành chính</h2>
          <div className="bg-white rounded-3xl p-5 shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)] border border-gray-100">
            <div className="grid grid-cols-4 gap-y-6 gap-x-2">
              {[
                { icon: Edit3, label: "Bài tập", color: "text-blue-500", bg: "bg-blue-50" },
                { icon: BarChart2, label: "Bảng điểm", color: "text-emerald-500", bg: "bg-emerald-50" },
                { icon: Briefcase, label: "Lương", color: "text-sky-500", bg: "bg-sky-50" },
                { icon: Calendar, label: "Xin nghỉ", color: "text-orange-500", bg: "bg-orange-50" },
                { icon: Clock, label: "Hết lịch", color: "text-amber-500", bg: "bg-amber-50" },
                { icon: Flag, label: "Sắp KT", color: "text-purple-500", bg: "bg-purple-50" },
                { icon: FileText, label: "Hoá đơn", color: "text-rose-500", bg: "bg-rose-50" },
                { icon: DollarSign, label: "Tổng lương", color: "text-indigo-500", bg: "bg-indigo-50" },
              ].map((item, i) => (
                <div key={i} className="flex flex-col items-center group cursor-pointer">
                  <div className={`w-[52px] h-[52px] rounded-2xl ${item.bg} flex items-center justify-center mb-2 transition-transform group-hover:scale-110 shadow-sm`}>
                    <item.icon className={`w-6 h-6 ${item.color} stroke-[2.2]`} />
                  </div>
                  <span className="text-[11px] font-medium text-gray-600 text-center leading-tight px-1">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Notifications Carousel */}
        <div className="mb-8">
          <div className="px-6 flex justify-between items-center mb-4">
            <h2 className="text-[17px] font-bold text-gray-900 tracking-tight">Thông báo mới</h2>
            <button className="text-sm font-medium text-indigo-500 flex items-center">
              Xem tất cả <ChevronRight className="w-4 h-4 ml-0.5" />
            </button>
          </div>
          <div className="flex overflow-x-auto hide-scrollbar pl-6 pr-2 gap-4 pb-4 -mb-4">
            {/* Card 1 */}
            <div className="min-w-[280px] bg-white rounded-2xl p-4 shadow-[0_8px_16px_-6px_rgba(0,0,0,0.05)] border border-gray-100 relative overflow-hidden flex-shrink-0">
              <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-indigo-500 to-purple-500"></div>
              <div className="pl-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-[10px] font-bold uppercase rounded-md tracking-wider">Lịch học</span>
                  <span className="text-xs text-gray-400 font-medium">10 phút trước</span>
                </div>
                <h3 className="text-[15px] font-semibold text-gray-800 leading-snug">Lịch học A32 - Thứ 5, 14:00-16:00</h3>
                <p className="text-sm text-gray-500 mt-1 line-clamp-1">Vui lòng chuẩn bị tài liệu bài 4 trước khi lên lớp.</p>
              </div>
            </div>
            
            {/* Card 2 */}
            <div className="min-w-[280px] bg-white rounded-2xl p-4 shadow-[0_8px_16px_-6px_rgba(0,0,0,0.05)] border border-gray-100 relative overflow-hidden flex-shrink-0 mr-4">
              <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-rose-400 to-orange-400"></div>
              <div className="pl-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2 py-0.5 bg-rose-50 text-rose-600 text-[10px] font-bold uppercase rounded-md tracking-wider">Bài tập</span>
                  <span className="text-xs text-gray-400 font-medium">2 giờ trước</span>
                </div>
                <h3 className="text-[15px] font-semibold text-gray-800 leading-snug">Bài tập lớp B12 - Hạn nộp 18/7</h3>
                <p className="text-sm text-gray-500 mt-1 line-clamp-1">Có 5 học viên đã nộp bài tập về nhà.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Schedule */}
        <div className="px-6 mb-8">
          <h2 className="text-[17px] font-bold text-gray-900 mb-4 tracking-tight">Lịch học hôm nay</h2>
          <div className="bg-white rounded-[24px] p-5 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.08)] border border-gray-100 relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-2.5 bg-gradient-to-b from-[#6c63ff] to-[#a855f7]"></div>
            <div className="pl-4 flex justify-between items-center">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                  <span className="text-xs font-semibold text-indigo-600 tracking-wide uppercase">Sắp diễn ra</span>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-1">Lớp A32</h3>
                <p className="text-gray-500 text-sm flex items-center font-medium">
                  <Clock className="w-4 h-4 mr-1.5 text-gray-400" />
                  14:00 – 16:00
                </p>
              </div>
              <div className="text-right bg-gray-50 py-2.5 px-4 rounded-2xl border border-gray-100">
                <div className="text-2xl font-bold text-gray-800">28<span className="text-base text-gray-400 font-semibold">/30</span></div>
                <div className="text-xs font-medium text-gray-500">Học viên</div>
              </div>
            </div>
            
            <div className="mt-5 pt-4 border-t border-gray-100 flex gap-3">
              <button className="flex-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-semibold py-2.5 rounded-xl transition-colors text-sm">
                Điểm danh
              </button>
              <button className="flex-1 bg-gray-900 hover:bg-gray-800 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm shadow-md">
                Vào lớp
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
