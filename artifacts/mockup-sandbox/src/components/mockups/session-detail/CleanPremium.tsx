import { useState, type ReactNode } from "react";
import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
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
    <div className="flex items-center gap-2 text-[12px] text-[#5b6872]">
      <span className="text-[#6e8890]">{icon}</span>
      <span>{children}</span>
    </div>
  );
}

function ContentRow({
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
    <div className="border-b border-[#e5e8e5] last:border-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="group flex min-h-[72px] w-full items-center gap-3 py-3.5 text-left transition-transform duration-200 active:scale-[0.985]"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#c7d8d4] bg-[#edf4f1] text-[12px] font-semibold text-[#3f716b]">
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className="min-w-0 flex-1">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-[#84918f]">
            {item.type}
          </span>
          <span className="block truncate text-[13px] font-semibold text-[#21333b]">
            {item.title}
          </span>
        </span>
        {item.attachments ? (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-[#5c817e]">
            <Paperclip size={13} strokeWidth={1.8} />
            {item.attachments.length}
          </span>
        ) : null}
        <span className="text-[#8d9b9a] transition-transform duration-200 group-hover:translate-x-0.5">
          {expanded ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
        </span>
      </button>
      {expanded ? (
        <div className="animate-[fadeIn_180ms_ease-out] border-t border-[#edf0ed] pb-4 pl-11 pr-1 pt-3">
          <p className="text-[12px] leading-[19px] text-[#657279]">{item.description}</p>
          {item.attachments?.map((attachment) => (
            <div
              key={attachment}
              className="mt-3 flex items-center gap-2.5 rounded-xl border border-[#d8e4df] bg-[#f5f8f6] px-3 py-2.5 text-[11px] font-medium text-[#416b68]"
            >
              <FileText size={15} strokeWidth={1.7} />
              <span className="min-w-0 flex-1 truncate">{attachment}</span>
              <ChevronRight size={14} className="text-[#87a19b]" />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function CleanPremium() {
  const [openContent, setOpenContent] = useState<string | null>("lesson-12");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [teachersOpen, setTeachersOpen] = useState(false);

  return (
    <main className="min-h-[100dvh] w-full overflow-y-auto bg-[#f8f8f4] text-[#21333b]">
      <div className="mx-auto min-h-[100dvh] max-w-[390px]">
        <header className="relative overflow-hidden bg-[#e8f0eb] px-5 pb-7 pt-5">
          <div className="absolute -right-16 -top-20 h-48 w-48 rounded-full border-[22px] border-[#d5e5de]/80" />
          <div className="absolute -bottom-24 -left-20 h-44 w-44 rounded-full border-[18px] border-[#dceae3]/75" />
          <button
            type="button"
            aria-label="Quay lại"
            onClick={() => undefined}
            className="relative mb-9 flex h-10 w-10 items-center justify-center rounded-full border border-[#c8d9d2] bg-[#f7faf6]/80 text-[#496e6a] transition-all duration-200 hover:bg-[#ffffff] active:scale-95"
          >
            <ArrowLeft size={19} strokeWidth={1.8} />
          </button>

          <div className="relative">
            <div className="mb-3 flex items-center gap-2.5">
              <span className="rounded-full bg-[#3f716b] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.13em] text-[#f7fbf7]">
                Offline
              </span>
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-[#52736d]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#67a174]" />
                Có học
              </span>
            </div>
            <h1 className="font-['Plus_Jakarta_Sans'] text-[27px] font-semibold tracking-[-0.045em] text-[#21333b]">
              ENG-KIDS-01
            </h1>
            <div className="mt-2 flex items-center gap-2 text-[12px] font-medium text-[#687c7b]">
              <CalendarDays size={14} strokeWidth={1.8} />
              <span>15/09/2026</span>
              <span className="h-1 w-1 rounded-full bg-[#a2b4ad]" />
              <span>Buổi 12</span>
            </div>
            <div className="mt-5 flex items-center gap-4">
              <MetaItem icon={<Clock3 size={15} strokeWidth={1.8} />}>
                <span className="font-semibold text-[#304850]">14:00 – 15:30</span>
              </MetaItem>
              <MetaItem icon={<MapPin size={15} strokeWidth={1.8} />}>
                Phòng A203
              </MetaItem>
            </div>
          </div>
        </header>

        <div className="px-5 pb-12 pt-7">
          <section className="mb-8">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8b9793]">
                Người hướng dẫn
              </p>
              <span className="text-[11px] text-[#95a19e]">1 giáo viên</span>
            </div>
            <button
              type="button"
              onClick={() => setTeachersOpen((open) => !open)}
              aria-expanded={teachersOpen}
              className="flex min-h-[58px] w-full items-center gap-3 border-b border-[#dfe5e0] py-2 text-left transition-colors hover:border-[#a9c5bd]"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#dcebe5] text-[#4e7a72]">
                <UserRound size={17} strokeWidth={1.7} />
              </span>
              <span className="flex-1 text-[14px] font-semibold text-[#30454c]">
                Nguyễn Minh Anh
              </span>
              <span className="text-[#91a19d]">
                {teachersOpen ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
              </span>
            </button>
            {teachersOpen ? (
              <div className="mt-3 rounded-xl bg-[#eef5f1] px-3 py-2.5 text-[11px] leading-[18px] text-[#637973]">
                Giáo viên phụ trách buổi học này
              </div>
            ) : null}
          </section>

          <section className="mb-8">
            <div className="mb-3 flex items-center gap-2">
              <BookOpen size={15} strokeWidth={1.8} className="text-[#5d837c]" />
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7e8e8a]">
                Nội dung buổi học
              </h2>
            </div>
            <div className="border-y border-[#dfe5e0]">
              {contents.map((item, index) => (
                <ContentRow
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

          <section className="rounded-2xl bg-[#f1eee3] px-4 py-4">
            <button
              type="button"
              onClick={() => setReviewOpen((open) => !open)}
              aria-expanded={reviewOpen}
              className="flex w-full items-center gap-3 text-left"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e4dcc3] text-[#8b7441]">
                <MessageCircle size={16} strokeWidth={1.8} />
              </span>
              <span className="flex-1">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.15em] text-[#9a8860]">
                  Nhận xét từ giáo viên
                </span>
                <span className="mt-1 block text-[12px] font-medium text-[#6f644d]">
                  {reviewOpen ? "Đánh giá buổi học" : "Đã có nhận xét cho buổi học này"}
                </span>
              </span>
              <span className="text-[#a08b5d]">
                {reviewOpen ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
              </span>
            </button>
            {reviewOpen ? (
              <div className="animate-[fadeIn_180ms_ease-out] mt-4 border-t border-[#ddd4b9] pt-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-[#826d3b]">
                    Nguyễn Minh Anh
                  </span>
                  <span className="text-[13px] tracking-[2px] text-[#b08a38]" aria-label="5 sao">
                    ★★★★★
                  </span>
                </div>
                <p className="text-[12px] leading-[19px] text-[#665d4b]">
                  Học viên tham gia đầy đủ và chủ động trong phần luyện nói. Con sử dụng
                  tốt từ vựng về các hoạt động hằng ngày.
                </p>
                <button
                  type="button"
                  onClick={() => setReviewOpen(false)}
                  className="mt-3 text-[11px] font-semibold text-[#846d39] underline decoration-[#cdbd8d] underline-offset-4"
                >
                  Thu gọn nhận xét
                </button>
              </div>
            ) : null}
          </section>
        </div>
      </div>
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </main>
  );
}