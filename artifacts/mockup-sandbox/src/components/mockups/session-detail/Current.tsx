import { useState } from "react";
import {
  ArrowLeft,
  BookOpen,
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

function DetailRow({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-slate-500">{icon}</span>
      {children}
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
    <div className="overflow-hidden rounded-xl bg-slate-100">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2.5 p-3 text-left transition-colors hover:bg-slate-200/70"
        aria-expanded={expanded}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600/10 text-xs font-bold text-blue-600">
          {index + 1}
        </span>
        <span className="min-w-0 flex-1">
          <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">
            {item.type}
          </span>
          <span className="block text-[13px] font-medium leading-[19px] text-slate-900">
            {item.title}
          </span>
        </span>
        {item.attachments && item.attachments.length > 0 ? (
          <span className="flex items-center gap-1 rounded-md bg-blue-600/10 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600">
            <Paperclip size={10} strokeWidth={2.5} />
            {item.attachments.length}
          </span>
        ) : null}
        <span className="text-slate-500">
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
      </button>
      {expanded ? (
        <div className="border-t border-slate-200/80 px-3 pb-3 pl-[58px] pt-2.5">
          <p className="text-[12px] leading-[18px] text-slate-600">
            {item.description}
          </p>
          {item.attachments?.map((attachment) => (
            <div
              key={attachment}
              className="mt-2 flex items-center gap-2 rounded-lg border border-blue-100 bg-white px-2.5 py-2 text-[11px] font-medium text-blue-700"
            >
              <FileText size={14} />
              <span className="min-w-0 flex-1 truncate">{attachment}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ReviewDetails({ onClose }: { onClose: () => void }) {
  return (
    <div className="border-t border-amber-200 px-3.5 pb-3.5 pt-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-amber-500">
          Nguyễn Minh Anh
        </span>
        <span className="tracking-[2px] text-sm text-amber-500">★★★★★</span>
      </div>
      <p className="rounded-lg bg-white px-2.5 py-2.5 text-[12px] leading-[18px] text-slate-700">
        Học viên tham gia đầy đủ và chủ động trong phần luyện nói. Con sử dụng
        tốt từ vựng về các hoạt động hằng ngày.
      </p>
      <button
        type="button"
        onClick={onClose}
        className="mt-2 text-[11px] font-semibold text-amber-700"
      >
        Thu gọn nhận xét
      </button>
    </div>
  );
}

export function Current() {
  const [openContent, setOpenContent] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [teachersOpen, setTeachersOpen] = useState(false);

  return (
    <main className="session-detail-sandbox min-h-screen w-full overflow-y-auto bg-[#f0eef6]">
      <header className="bg-[#ddd6fe]/[0.16] px-4 pb-5 pt-5">
        <div className="mb-3.5 flex items-center">
          <button
            type="button"
            aria-label="Quay lại"
            onClick={() => undefined}
            className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-blue-600/10 text-blue-600 transition-colors hover:bg-blue-600/15"
          >
            <ArrowLeft size={20} strokeWidth={2} />
          </button>
        </div>

        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[22px] font-bold leading-7 text-slate-900">
              ENG-KIDS-01
            </h1>
            <span className="rounded-full border border-blue-600/20 bg-blue-600/10 px-2.5 py-1 text-xs font-medium text-blue-600">
              Offline
            </span>
            <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-800">
              Có học
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <DetailRow icon={<Clock3 size={14} />}>
              <span className="text-sm font-semibold text-slate-900">
                14:00 – 15:30
              </span>
            </DetailRow>
            <DetailRow icon={<MapPin size={14} />}>
              <span className="text-sm text-slate-900">Phòng A203</span>
            </DetailRow>
          </div>

          <div className="flex items-center gap-3 text-[13px] text-slate-500">
            <span>15/09/2026</span>
            <span>Buổi 12</span>
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-4 p-4 pb-10">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_2px_8px_rgba(15,23,42,0.05)]">
          <button
            type="button"
            onClick={() => setTeachersOpen((open) => !open)}
            className="flex w-full items-center gap-2 border-b border-slate-200 px-3.5 py-3.5 text-left"
            aria-expanded={teachersOpen}
          >
            <UserRound size={15} className="text-blue-600" />
            <span className="flex-1 text-[13px] font-bold uppercase tracking-[0.07em] text-slate-900">
              Giáo viên
            </span>
            <span className="rounded-full bg-blue-600/10 px-2 py-0.5 text-xs font-semibold text-blue-600">
              1
            </span>
          </button>
          <div className="flex items-center gap-2.5 px-3.5 py-3">
            <span className="flex-1 truncate text-[13px] leading-[19px] text-slate-900">
              Nguyễn Minh Anh
            </span>
            {teachersOpen ? (
              <ChevronDown size={16} className="text-slate-500" />
            ) : (
              <ChevronRight size={16} className="text-slate-500" />
            )}
          </div>
          {teachersOpen ? (
            <div className="border-t border-slate-100 px-3.5 pb-3.5 pt-2">
              <div className="flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600/10 text-blue-600">
                  <UserRound size={15} />
                </span>
                <span className="text-[13px] font-semibold text-slate-900">
                  Nguyễn Minh Anh
                </span>
              </div>
            </div>
          ) : null}
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center gap-2 border-b border-slate-200 px-3.5 py-3.5">
            <BookOpen size={15} className="text-blue-600" />
            <h2 className="text-[13px] font-bold uppercase tracking-[0.07em] text-slate-900">
              Nội dung buổi học
            </h2>
          </div>
          <div className="flex flex-col gap-2 p-3.5">
            {contents.map((item, index) => (
              <ContentCard
                key={item.id}
                item={item}
                index={index}
                expanded={openContent === item.id}
                onToggle={() =>
                  setOpenContent((open) => (open === item.id ? null : item.id))
                }
              />
            ))}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-amber-200 bg-[#fffbeb]">
          <button
            type="button"
            onClick={() => setReviewOpen((open) => !open)}
            className="flex w-full items-center gap-2 border-b border-amber-200 px-3.5 py-3.5 text-left"
            aria-expanded={reviewOpen}
          >
            <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-amber-500/10">
              <MessageCircle size={15} className="text-amber-500" />
            </span>
            <span className="flex-1 text-[13px] font-bold uppercase tracking-[0.07em] text-slate-900">
              Nhận xét từ giáo viên
            </span>
            {reviewOpen ? (
              <ChevronDown size={16} className="text-amber-500" />
            ) : (
              <ChevronRight size={16} className="text-amber-500" />
            )}
          </button>
          {reviewOpen ? (
            <ReviewDetails onClose={() => setReviewOpen(false)} />
          ) : (
            <div className="px-3.5 py-3.5">
              <p className="text-[13px] leading-5 text-amber-800">
                Giáo viên đã có nhận xét cho buổi học này. Nhấn để xem chi tiết.
              </p>
            </div>
          )}
        </section>

      </div>
    </main>
  );
}