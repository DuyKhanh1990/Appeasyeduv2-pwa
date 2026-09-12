import React from 'react';
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
  ChevronRight,
  BookOpen
} from 'lucide-react';

const quickActions = [
  { icon: <Edit3 size={24} strokeWidth={2.5} />, label: "Bài tập/KT", color: "from-blue-400 to-blue-600", shadow: "shadow-blue-200/50" },
  { icon: <BarChart2 size={24} strokeWidth={2.5} />, label: "Bảng điểm", color: "from-emerald-400 to-emerald-600", shadow: "shadow-emerald-200/50" },
  { icon: <Briefcase size={24} strokeWidth={2.5} />, label: "Lương dạy", color: "from-sky-400 to-sky-600", shadow: "shadow-sky-200/50" },
  { icon: <Calendar size={24} strokeWidth={2.5} />, label: "Xin nghỉ", color: "from-orange-400 to-orange-600", shadow: "shadow-orange-200/50" },
  
  { icon: <Clock size={24} strokeWidth={2.5} />, label: "HV sắp hết", color: "from-amber-400 to-orange-500", shadow: "shadow-orange-200/50" },
  { icon: <Flag size={24} strokeWidth={2.5} />, label: "Sắp kết thúc", color: "from-purple-400 to-purple-600", shadow: "shadow-purple-200/50" },
  { icon: <FileText size={24} strokeWidth={2.5} />, label: "Hoá đơn", color: "from-yellow-400 to-amber-500", shadow: "shadow-yellow-200/50" },
  { icon: <DollarSign size={24} strokeWidth={2.5} />, label: "Tổng lương", color: "from-teal-400 to-teal-600", shadow: "shadow-teal-200/50" },
];

export function VariantB() {
  return (
    <>
      <style dangerouslySetInnerHTML={{__html: `
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}} />
      <div 
        className="variant-b-container w-full max-w-[390px] min-h-[844px] bg-[#f5f6fa] relative overflow-x-hidden overflow-y-auto mx-auto shadow-2xl"
        style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
      >
        {/* Header Background */}
        <div className="bg-gradient-to-br from-indigo-600 via-purple-600 to-blue-500 pt-12 pb-24 px-5 rounded-b-[2.5rem] relative">
          {/* subtle pattern overlay */}
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_1px_1px,#fff_1px,transparent_0)] [background-size:20px_20px] rounded-b-[2.5rem]"></div>
          
          {/* User Info */}
          <div className="flex justify-between items-center relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full border-[2.5px] border-white/40 overflow-hidden bg-white/20 shadow-md">
                <img src="/__mockup/images/avatar-gv1.jpg" alt="Avatar" className="w-full h-full object-cover" />
              </div>
              <div>
                <div className="text-white/80 text-xs font-semibold uppercase tracking-wider mb-0.5">Thứ Năm, 16 Tháng 7</div>
                <div className="text-white font-bold text-lg leading-none">Giáo viên 1 (gv1)</div>
              </div>
            </div>
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-white/15 backdrop-blur-md flex items-center justify-center relative cursor-pointer active:scale-95 transition-transform border border-white/20">
                <Bell className="w-5 h-5 text-white" fill="currentColor" fillOpacity={0.2} />
              </div>
              <div className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[11px] font-bold min-w-[22px] h-[22px] px-1 flex items-center justify-center rounded-full border-2 border-purple-600 shadow-sm">
                27
              </div>
            </div>
          </div>
        </div>

        {/* Stats Row - Floating */}
        <div className="-mt-14 px-5 relative z-20">
          <div className="bg-white rounded-[20px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-4 flex justify-between items-center border border-gray-50/50">
            <div className="flex flex-col items-center flex-1 cursor-pointer active:opacity-70">
              <div className="text-[22px] font-extrabold text-gray-800 leading-none mb-1.5">33</div>
              <div className="text-[11px] text-gray-500 font-bold uppercase tracking-wide">Lớp học</div>
            </div>
            <div className="w-[1.5px] h-10 bg-gray-100 rounded-full"></div>
            <div className="flex flex-col items-center flex-1 cursor-pointer active:opacity-70">
              <div className="text-[22px] font-extrabold text-gray-800 leading-none mb-1.5">0/6</div>
              <div className="text-[11px] text-gray-500 font-bold uppercase tracking-wide">Công việc</div>
            </div>
            <div className="w-[1.5px] h-10 bg-gray-100 rounded-full"></div>
            <div className="flex flex-col items-center flex-1 cursor-pointer active:opacity-70">
              <div className="text-[22px] font-extrabold text-indigo-600 leading-none mb-1.5">15/25</div>
              <div className="text-[11px] text-gray-500 font-bold uppercase tracking-wide">Đã dạy</div>
            </div>
          </div>
        </div>

        {/* Quick Access Icons */}
        <div className="px-5 mt-7">
          <div className="flex justify-between items-end mb-4">
            <h2 className="text-[17px] font-bold text-gray-800 tracking-tight">Học vụ - Hành chính</h2>
          </div>
          <div className="grid grid-cols-4 gap-y-6 gap-x-2">
            {quickActions.map((action, i) => (
              <div key={i} className="flex flex-col items-center gap-2 cursor-pointer group active:scale-95 transition-transform">
                <div className={`w-[58px] h-[58px] rounded-[20px] bg-gradient-to-br ${action.color} shadow-lg ${action.shadow} flex items-center justify-center text-white relative overflow-hidden`}>
                  <div className="absolute inset-0 bg-white/20 opacity-0 group-active:opacity-100 transition-opacity"></div>
                  {action.icon}
                </div>
                <span className="text-[11px] font-bold text-gray-600 text-center leading-tight px-1">{action.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Notification Carousel */}
        <div className="mt-8">
          <div className="px-5 flex justify-between items-center mb-4">
            <h2 className="text-[17px] font-bold text-gray-800 tracking-tight">Thông báo mới</h2>
            <button className="text-indigo-600 text-sm font-bold flex items-center active:opacity-70">
              Xem tất cả <ChevronRight size={16} strokeWidth={2.5} className="ml-0.5" />
            </button>
          </div>
          <div className="flex overflow-x-auto px-5 gap-4 hide-scrollbar pb-4 pt-1 snap-x">
            {/* Card 1 */}
            <div className="min-w-[260px] snap-center bg-white rounded-2xl shadow-[0_4px_20px_rgb(0,0,0,0.03)] p-4 relative overflow-hidden border border-gray-100 flex items-start gap-3.5 cursor-pointer active:scale-[0.98] transition-transform">
              <div className="absolute left-0 top-0 bottom-0 w-[5px] bg-blue-500"></div>
              <div className="w-11 h-11 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0 text-blue-600">
                <Calendar size={22} strokeWidth={2.5} />
              </div>
              <div className="flex-1">
                <h3 className="text-[15px] font-bold text-gray-800 line-clamp-1 leading-snug">Lịch học A32 - Thứ 5</h3>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="bg-gray-100 text-gray-600 text-[11px] px-2 py-0.5 rounded-md font-bold">14:00 - 16:00</span>
                </div>
              </div>
            </div>
            {/* Card 2 */}
            <div className="min-w-[260px] snap-center bg-white rounded-2xl shadow-[0_4px_20px_rgb(0,0,0,0.03)] p-4 relative overflow-hidden border border-gray-100 flex items-start gap-3.5 cursor-pointer active:scale-[0.98] transition-transform">
              <div className="absolute left-0 top-0 bottom-0 w-[5px] bg-purple-500"></div>
              <div className="w-11 h-11 rounded-full bg-purple-50 flex items-center justify-center flex-shrink-0 text-purple-600">
                <Edit3 size={22} strokeWidth={2.5} />
              </div>
              <div className="flex-1">
                <h3 className="text-[15px] font-bold text-gray-800 line-clamp-1 leading-snug">Bài tập lớp B12</h3>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="bg-red-50 text-red-600 text-[11px] px-2 py-0.5 rounded-md font-bold">Hạn nộp 18/7</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Schedule */}
        <div className="px-5 mt-4 pb-12">
          <h2 className="text-[17px] font-bold text-gray-800 tracking-tight mb-4">Lịch học hôm nay</h2>
          <div className="bg-white rounded-[20px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-5 border border-gray-100 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-50 rounded-bl-full -z-0 opacity-50 pointer-events-none"></div>
            
            <div className="flex justify-between items-start mb-4 relative z-10">
              <div className="flex items-center gap-3.5">
                <div className="w-[52px] h-[52px] rounded-[16px] bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-md shadow-indigo-200">
                  <BookOpen size={26} strokeWidth={2.5} />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-gray-800 leading-tight">Lớp A32</h3>
                  <div className="flex items-center gap-1.5 mt-1">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    <p className="text-[13px] font-bold text-gray-500">28/30 Học viên</p>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex items-center justify-between bg-[#f8f9fa] rounded-xl p-3 mb-4 relative z-10 border border-gray-100">
              <div className="flex items-center gap-2">
                <Clock size={16} className="text-indigo-600" strokeWidth={2.5} />
                <span className="text-[13px] font-bold text-gray-700">14:00 - 16:00</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar size={16} className="text-indigo-600" strokeWidth={2.5} />
                <span className="text-[13px] font-bold text-gray-700">16 Tháng 7</span>
              </div>
            </div>
            
            <div className="flex gap-3 relative z-10">
              <button className="flex-1 bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-bold py-3.5 rounded-xl text-[14px] shadow-lg shadow-indigo-200 active:scale-95 transition-transform">
                Điểm danh
              </button>
              <button className="flex-1 bg-indigo-50 text-indigo-700 font-bold py-3.5 rounded-xl text-[14px] active:scale-95 transition-transform border border-indigo-100">
                Chi tiết lớp
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
