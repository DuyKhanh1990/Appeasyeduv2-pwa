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

function MetaItem({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2 text-[12px] font-medium text-[#416070]">
      <span className="text-[#167c80]">{icon}</span>
      <span className="truncate">{children}</span>
    </div>
  );
}

function ContentCard({
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
    <div
      className={`overflow-hidden rounded-2xl border transition-all duration-200 ${
        expanded
          ? "border-[#9bd4d1] bg-[#f5fffd] shadow-[0_7px_18px_rgba(21,125,128,0.08)]"
          : "border-[#dceceb] bg-[#fbfefd]"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex min-h-[72px] w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-[#f0fbf9]"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#d9f1ee] text-[13px] font-bold text-[#14777a]">
          0{index + 1}
        </span>
        <span className="min-w-0 flex-1">
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.13em] text-[#7a9a9f]">
            {item.type}
          </span>
          <span className="block text-[13px] font-bold leading-[18px] text-[#183b47]">
            {item.title}
          </span>
        </span>
        {item.attachments?.length ? (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-[#e6f4ff] px-2 py-1 text-[10px] font-bold text-[#2a6d9c]">
            <Paperclip size={11} strokeWidth={2.6} />
            {item.attachments.length}
          </span>
        ) : null}
        <span className="text-[#7a9a9f]">
          {expanded ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
        </span>
      </button>
      {expanded ? (
        <div className="border-t border-[#d9eeeb] px-3.5 pb-3.5 pl-[62px] pt-3">
          <p className="text-[12px] leading-[18px] text-[#58717a]">
            {item.description}
          </p>
          {item.attachments?.map((attachment) => (
            <button
              key={attachment}
              type="button"
              className="mt-3 flex min-h-[42px] w-full items-center gap-2 rounded-xl border border-[#bfdfed] bg-white px-2.5 text-left text-[11px] font-bold text-[#276c9b] transition-transform hover:-translate-y-0.5"
            >
              <FileText size={15} />
              <span className="min-w-0 flex-1 truncate">{attachment}</span>
              <ChevronRight size={14} />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ModernCards() {
  const [openContent, setOpenContent] = useState<string | null>("lesson-12");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [teachersOpen, setTeachersOpen] = useState(false);

  return (
    <main className="min-h-[100dvh] w-full overflow-y-auto bg-[#f3faf8] font-['Plus_Jakarta_Sans',ui-sans-serif,sans-serif] text-[#183b47]">
      <header className="relative overflow-hidden bg-[#d9f1ee] px-4 pb-5 pt-4">
        <div className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full bg-[#f7d98d]/45" />
        <div className="pointer-events-none absolute -bottom-14 left-28 h-28 w-28 rounded-full bg-[#b9e2ed]/60" />
        <div className="relative">
          <button
            type="button"
            aria-label="Quay lại"
            onClick={() => undefined}
            className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl bg-white/75 text-[#14777a] shadow-sm transition-transform hover:-translate-x-0.5"
          >
            <ArrowLeft size={20} strokeWidth={2.2} />
          </button>

          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.16em] text-[#488287]">
                Buổi học 12
              </p>
              <h1 className="text-[24px] font-extrabold leading-8 tracking-[-0.04em] text-[#153d49]">
                ENG-KIDS-01
              </h1>
            </div>
            <span className="mt-1 flex items-center gap-1.5 rounded-full bg-[#198a72] px-3 py-1.5 text-[11px] font-bold text-white shadow-[0_4px_10px_rgba(25,138,114,0.18)]">
              <Check size={13} strokeWidth={3} />
              Có học
            </span>
          </div>

          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2.5">
            <MetaItem icon={<Clock3 size={15} />}>14:00 – 15:30</MetaItem>
            <MetaItem icon={<MapPin size={15} />}>Phòng A203</MetaItem>
            <span className="rounded-full bg-white/65 px-2.5 py-1 text-[11px] font-bold text-[#4c7078]">
              Offline
            </span>
          </div>
          <div className="mt-3 flex items-center gap-3 text-[12px] font-medium text-[#5b7d83]">
            <span>15/09/2026</span>
            <span className="h-1 w-1 rounded-full bg-[#7fa9a8]" />
            <span>Thứ ba</span>
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-3.5 px-4 pb-10 pt-4">
        <section className="overflow-hidden rounded-2xl border border-[#dceceb] bg-white shadow-[0_4px_16px_rgba(25,91,99,0.06)]">
          <button
            type="button"
            onClick={() => setTeachersOpen((open) => !open)}
            aria-expanded={teachersOpen}
            className="flex min-h-[55px] w-full items-center gap-2.5 px-3.5 text-left"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#e4f5f2] text-[#14777a]">
              <UserRound size={15} />
            </span>
            <span className="flex-1 text-[12px] font-extrabold uppercase tracking-[0.12em] text-[#294e59]">
              Giáo viên
            </span>
            <span className="rounded-full bg-[#e4f5f2] px-2 py-1 text-[10px] font-bold text-[#14777a]">
              1
            </span>
            {teachersOpen ? <ChevronDown size={16} className="text-[#719499]" /> : <ChevronRight size={16} className="text-[#719499]" />}
          </button>
          <div className="border-t border-[#eef6f4] px-3.5 py-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f7d98d] text-[12px] font-extrabold text-[#765b1e]">
                MA
              </span>
              <span className="flex-1 text-[13px] font-bold text-[#244651]">Nguyễn Minh Anh</span>
              <span className="text-[10px] font-semibold text-[#88a1a5]">{teachersOpen ? "Đang xem" : "Giáo viên chính"}</span>
            </div>
            {teachersOpen ? (
              <div className="mt-3 rounded-xl bg-[#f3faf8] px-3 py-2 text-[11px] leading-[17px] text-[#5c777d]">
                Giáo viên phụ trách buổi học và nhận xét tiến độ của học viên.
              </div>
            ) : null}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-[#dceceb] bg-white shadow-[0_4px_16px_rgba(25,91,99,0.05)]">
          <div className="flex items-center gap-2.5 border-b border-[#eef6f4] px-3.5 py-3.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#e4f5f2] text-[#14777a]">
              <BookOpen size={16} />
            </span>
            <h2 className="flex-1 text-[12px] font-extrabold uppercase tracking-[0.12em] text-[#294e59]">
              Nội dung buổi học
            </h2>
            <span className="text-[11px] font-bold text-[#8aa3a6]">2 mục</span>
          </div>
          <div className="flex flex-col gap-2.5 p-3.5">
            {contents.map((item, index) => (
              <ContentCard
                key={item.id}
                item={item}
                index={index}
                expanded={openContent === item.id}
                onToggle={() => setOpenContent((open) => (open === item.id ? null : item.id))}
              />
            ))}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-[#f0dfad] bg-[#fffaf0] shadow-[0_4px_16px_rgba(154,112,31,0.05)]">
          <button
            type="button"
            onClick={() => setReviewOpen((open) => !open)}
            aria-expanded={reviewOpen}
            className="flex min-h-[59px] w-full items-center gap-2.5 px-3.5 text-left"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#ffedc0] text-[#ad7a17]">
              <MessageCircle size={16} />
            </span>
            <span className="flex-1 text-[12px] font-extrabold uppercase tracking-[0.1em] text-[#665127]">
              Nhận xét từ giáo viên
            </span>
            <span className="text-[#ad7a17]">
              {reviewOpen ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
            </span>
          </button>
          {reviewOpen ? (
            <div className="border-t border-[#f0dfad] px-3.5 pb-3.5 pt-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[12px] font-bold text-[#a46f11]">Nguyễn Minh Anh</span>
                <span className="text-[12px] tracking-[2px] text-[#d19522]">★★★★★</span>
              </div>
              <p className="rounded-xl bg-white px-3 py-3 text-[12px] leading-[18px] text-[#675c43]">
                Học viên tham gia đầy đủ và chủ động trong phần luyện nói. Con sử dụng tốt từ vựng về các hoạt động hằng ngày.
              </p>
              <button type="button" onClick={() => setReviewOpen(false)} className="mt-2.5 text-[11px] font-bold text-[#a46f11]">
                Thu gọn nhận xét
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setReviewOpen(true)} className="w-full border-t border-[#f0dfad] px-3.5 py-3 text-left text-[12px] leading-[18px] text-[#8b7139]">
              Giáo viên đã có nhận xét cho buổi học này. Nhấn để xem chi tiết.
            </button>
          )}
        </section>
      </div>
    </main>
  );
}