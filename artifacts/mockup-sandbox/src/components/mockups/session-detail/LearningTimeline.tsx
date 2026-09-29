import { useState, type ReactNode } from "react";
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  FileText,
  MapPin,
  MessageCircle,
  Paperclip,
  UserRound,
} from "lucide-react";

import "./_group.css";

type ContentItem = {
  id: string;
  type: string;
  title: string;
  description?: string;
  attachments?: string[];
};

const contents: ContentItem[] = [
  {
    id: "lesson-12",
    type: "Lesson",
    title: "Talking about daily routines",
    description:
      "Practice vocabulary and simple present questions about everyday activities.",
    attachments: ["Lesson 12 · Daily routines.pdf"],
  },
  {
    id: "activity-12",
    type: "Activity",
    title: "Speaking practice: My day",
    description:
      "Work with a partner to ask and answer questions about your day.",
  },
];

function TimelineNode({
  children,
  last = false,
  tone = "blue",
}: {
  children: ReactNode;
  last?: boolean;
  tone?: "blue" | "mint" | "amber";
}) {
  const dot =
    tone === "mint"
      ? "bg-[#3b9b7a]"
      : tone === "amber"
        ? "bg-[#dc9b39]"
        : "bg-[#4a72c9]";

  return (
    <div className="relative flex gap-3.5">
      {!last ? (
        <span className="absolute bottom-[-18px] left-[10px] top-[23px] w-px bg-[#d9e1ed]" />
      ) : null}
      <span className={`relative z-10 mt-1.5 h-5 w-5 shrink-0 rounded-full border-[5px] border-[#f5f7fb] ${dot} shadow-[0_0_0_1px_rgba(74,114,201,0.18)]`} />
      <div className="min-w-0 flex-1 pb-6">{children}</div>
    </div>
  );
}

function JourneyCard({
  item,
  index,
  expanded,
  onToggle,
}: {
  item: ContentItem;
  index: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-[15px] border border-[#e2e8f1] bg-white shadow-[0_4px_14px_rgba(57,79,109,0.06)] transition-transform duration-200 hover:-translate-y-0.5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex min-h-[66px] w-full items-center gap-3 px-3.5 py-3 text-left"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[#edf3ff] text-[12px] font-bold text-[#4a72c9]">
          0{index + 1}
        </span>
        <span className="min-w-0 flex-1">
          <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-[#8190a6]">
            {item.type}
          </span>
          <span className="block text-[13px] font-semibold leading-[18px] text-[#26364f]">
            {item.title}
          </span>
        </span>
        {item.attachments ? (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-[#edf3ff] px-2 py-1 text-[10px] font-bold text-[#4a72c9]">
            <Paperclip size={11} />
            {item.attachments.length}
          </span>
        ) : null}
        <span className="text-[#8b9ab1]">
          {expanded ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
        </span>
      </button>
      {expanded ? (
        <div className="border-t border-[#edf0f5] px-3.5 pb-3.5 pl-[59px] pt-2.5">
          <p className="text-[12px] leading-[18px] text-[#64738a]">{item.description}</p>
          {item.attachments?.map((attachment) => (
            <button
              type="button"
              key={attachment}
              className="mt-2 flex min-h-10 w-full items-center gap-2 rounded-[10px] border border-[#d9e5fa] bg-[#f5f8ff] px-2.5 text-left text-[11px] font-semibold text-[#4169b9] transition-colors hover:bg-[#edf3ff]"
            >
              <FileText size={14} />
              <span className="min-w-0 flex-1 truncate">{attachment}</span>
              <ChevronRight size={14} />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function LearningTimeline() {
  const [openContent, setOpenContent] = useState<string | null>("lesson-12");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [teachersOpen, setTeachersOpen] = useState(false);

  return (
    <main className="session-detail-sandbox min-h-[100dvh] w-full overflow-y-auto bg-[#f5f7fb] text-[#26364f]">
      <header className="bg-[#eef3ff] px-5 pb-6 pt-5">
        <button
          type="button"
          aria-label="Quay lại"
          onClick={() => undefined}
          className="mb-5 flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#4a72c9] shadow-[0_3px_10px_rgba(74,114,201,0.1)] transition-transform hover:-translate-x-0.5"
        >
          <ArrowLeft size={19} />
        </button>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[#7283a0]">
              Hành trình học tập · Buổi 12
            </p>
            <h1 className="text-[25px] font-bold leading-8 tracking-[-0.03em] text-[#26364f]">
              ENG-KIDS-01
            </h1>
          </div>
          <span className="mt-1 rounded-full bg-[#d9f1e6] px-3 py-1.5 text-[11px] font-bold text-[#277557]">
            Có học
          </span>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-y-3 text-[12px]">
          <span className="flex items-center gap-2 font-semibold text-[#40516d]">
            <Clock3 size={15} className="text-[#4a72c9]" />14:00 – 15:30
          </span>
          <span className="flex items-center gap-2 text-[#40516d]">
            <MapPin size={15} className="text-[#4a72c9]" />Phòng A203
          </span>
          <span className="text-[#7283a0]">15/09/2026</span>
          <span className="text-[#7283a0]">Offline</span>
        </div>
      </header>

      <div className="px-5 pb-10 pt-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#8a98ad]">Tóm tắt buổi học</p>
            <h2 className="mt-1 text-[17px] font-bold text-[#26364f]">Một chặng đường trọn vẹn</h2>
          </div>
          <span className="flex items-center gap-1.5 rounded-full bg-[#e4f3ec] px-2.5 py-1.5 text-[10px] font-bold text-[#318666]">
            <Check size={13} strokeWidth={3} /> Hoàn tất
          </span>
        </div>

        <TimelineNode>
          <button
            type="button"
            onClick={() => setTeachersOpen((open) => !open)}
            aria-expanded={teachersOpen}
            className="w-full rounded-[15px] border border-[#e2e8f1] bg-white p-3.5 text-left shadow-[0_4px_14px_rgba(57,79,109,0.06)]"
          >
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#eaf4f0] text-[#3b9b7a]">
                <UserRound size={14} />
              </span>
              <span className="flex-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#8190a6]">Bắt đầu cùng giáo viên</span>
              {teachersOpen ? <ChevronDown size={16} className="text-[#8b9ab1]" /> : <ChevronRight size={16} className="text-[#8b9ab1]" />}
            </div>
            <p className="mt-3 pl-9 text-[14px] font-semibold text-[#26364f]">Nguyễn Minh Anh</p>
            {teachersOpen ? <p className="mt-1 pl-9 text-[12px] leading-[18px] text-[#7283a0]">Giáo viên đồng hành trong buổi học này.</p> : null}
          </button>
        </TimelineNode>

        <TimelineNode tone="mint" last>
          <div className="mb-2 flex items-center gap-2">
            <BookOpen size={16} className="text-[#3b9b7a]" />
            <h3 className="text-[13px] font-bold text-[#26364f]">Nội dung buổi học</h3>
            <span className="ml-auto text-[11px] font-semibold text-[#91a0b4]">2 hoạt động</span>
          </div>
          <div className="flex flex-col gap-2.5">
            {contents.map((item, index) => (
              <JourneyCard
                key={item.id}
                item={item}
                index={index}
                expanded={openContent === item.id}
                onToggle={() => setOpenContent((open) => (open === item.id ? null : item.id))}
              />
            ))}
          </div>
        </TimelineNode>

        <div className="ml-[9px] flex items-center gap-3 border-t border-[#d9e1ed] py-4">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#dc9b39] text-white"><Check size={12} strokeWidth={3} /></span>
          <span className="text-[11px] font-semibold text-[#8190a6]">Buổi học đã kết thúc</span>
        </div>

        <section className="overflow-hidden rounded-[17px] border border-[#f0dfbb] bg-[#fffbf2] shadow-[0_4px_14px_rgba(183,139,54,0.06)]">
          <button
            type="button"
            onClick={() => setReviewOpen((open) => !open)}
            aria-expanded={reviewOpen}
            className="flex min-h-[63px] w-full items-center gap-3 px-3.5 py-3 text-left"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#fff0ce] text-[#c78b2f]"><MessageCircle size={15} /></span>
            <span className="flex-1">
              <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-[#a07c43]">Lời nhắn sau buổi học</span>
              <span className="mt-1 block text-[12px] font-semibold text-[#604b2b]">Nhận xét từ giáo viên</span>
            </span>
            {reviewOpen ? <ChevronDown size={17} className="text-[#c78b2f]" /> : <ChevronRight size={17} className="text-[#c78b2f]" />}
          </button>
          {reviewOpen ? (
            <div className="border-t border-[#f0dfbb] px-3.5 pb-4 pt-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-bold text-[#a1712c]">Nguyễn Minh Anh</span>
                <span className="text-sm tracking-[2px] text-[#d39837]">★★★★★</span>
              </div>
              <p className="rounded-xl bg-white/80 px-3 py-2.5 text-[12px] leading-[18px] text-[#66563f]">
                Học viên tham gia đầy đủ và chủ động trong phần luyện nói. Con sử dụng tốt từ vựng về các hoạt động hằng ngày.
              </p>
            </div>
          ) : (
            <p className="px-3.5 pb-3.5 text-[12px] leading-[18px] text-[#856f4d]">Giáo viên đã để lại nhận xét cho hành trình hôm nay.</p>
          )}
        </section>
      </div>
    </main>
  );
}