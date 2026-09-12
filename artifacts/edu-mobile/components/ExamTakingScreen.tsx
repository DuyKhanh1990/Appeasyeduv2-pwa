import { Feather } from "@expo/vector-icons";
import { Audio } from "expo-av";
import { File, Paths } from "expo-file-system/next";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import React, { useCallback, useEffect, useRef, useState } from "react";
import Pdf from "react-native-pdf";
import { WebView } from "react-native-webview";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useColors } from "@/hooks/useColors";
import { useSafeAreaInsets } from "@/hooks/useSafeAreaInsets";
import { getCenterUrl, getAuthToken } from "@/lib/api";

// ─── API Types (matching real web API) ───────────────────────────────────────

export interface ExamOption {
  id: string;
  text: string;
}

export interface ContentPart {
  type: "text" | "blank";
  text?: string;
  blankId?: string;
  index?: number;
}

export interface MatchingData {
  leftItems: { id: string; text: string }[];
  rightItems: { id: string; text: string }[];
  scorePerPair: number;
  shuffleB: boolean;
  correctPairs?: { leftId: string; rightId: string; leftText: string; rightText: string }[];
}

export interface ApiQuestion {
  id: string;
  type: "single_choice" | "multiple_choice" | "fill_blank" | "essay" | "matching";
  title: string | null;
  content: string;
  mediaImageUrl: string | null;
  mediaAudioUrl: string | null;
  score: string;
  difficulty: string | null;
  explanation: string | null;
  options: ExamOption[] | null;
  correctAnswer: string | null;
  contentParts: ContentPart[] | null;
  matchingData: MatchingData | null;
}

export interface SectionQuestion {
  id: string;
  sectionId: string;
  questionId: string;
  orderIndex: number;
  question: ApiQuestion;
}

export interface AudioInfo {
  url: string;
  name: string;
}

export interface PassageInfo {
  url: string;
  absoluteUrl: string;
  name: string;
  fileType: string;
  viewerUrl: string | null;
  canEmbedDirect: boolean;
}

export interface ExamSection {
  id: string;
  examId: string;
  name: string;
  type: "listening" | "speaking" | "reading" | "writing";
  orderIndex: number;
  aiGradingEnabled: boolean;
  audioInfo: AudioInfo | null;
  passageInfo: PassageInfo | null;
  questions: SectionQuestion[];
}

export interface ExamData {
  id: string;
  name: string;
  timeLimitMinutes?: number | null;
  sections: ExamSection[];
}

export type QuestionAnswer = string | Record<string, string>;
export type AllAnswers = Record<string, QuestionAnswer>;

export interface PartScore {
  partName: string;
  correct: number;
  total: number;
  score: number;
}

export interface ExamSubmitPayload {
  answers: AllAnswers;
  score: string;
  partScores: PartScore[];
  timeTakenSeconds: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface FlatQuestion extends SectionQuestion {
  sectionIdx: number;
  sectionName: string;
}

function buildFlat(sections: ExamSection[]): FlatQuestion[] {
  const flat: FlatQuestion[] = [];
  sections.forEach((sec, si) =>
    sec.questions.forEach((sq) => flat.push({ ...sq, sectionIdx: si, sectionName: sec.name }))
  );
  return flat;
}

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatMs(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

interface QuestionScore { correct: boolean; partialScore: number; maxScore: number; isEssay: boolean; }

function scoreQuestion(sq: SectionQuestion, answer: QuestionAnswer | undefined): QuestionScore {
  const q = sq.question;
  const maxScore = parseFloat(q.score) || 0;
  if (q.type === "essay") return { correct: false, partialScore: 0, maxScore, isEssay: true };
  if (!answer) return { correct: false, partialScore: 0, maxScore, isEssay: false };

  if (q.type === "single_choice") {
    const correct = q.correctAnswer?.trim() === String(answer).trim();
    return { correct, partialScore: correct ? maxScore : 0, maxScore, isEssay: false };
  }
  if (q.type === "multiple_choice") {
    const correctIds = (q.correctAnswer || "").split(",").map((s) => s.trim()).filter(Boolean).sort();
    const userIds = String(answer).split(",").map((s) => s.trim()).filter(Boolean).sort();
    const correct = JSON.stringify(correctIds) === JSON.stringify(userIds);
    return { correct, partialScore: correct ? maxScore : 0, maxScore, isEssay: false };
  }
  if (q.type === "fill_blank") {
    if (typeof answer === "object") {
      try {
        const correctMap: Record<string, string> = JSON.parse(q.correctAnswer || "{}");
        const totalBlanks = Object.keys(correctMap).length;
        if (totalBlanks === 0) return { correct: false, partialScore: 0, maxScore, isEssay: false };
        const correctCount = Object.entries(correctMap).filter(([id, val]) =>
          ((answer as Record<string, string>)[id] || "").trim().toLowerCase() === val.trim().toLowerCase()
        ).length;
        const partial = (correctCount / totalBlanks) * maxScore;
        return { correct: correctCount === totalBlanks, partialScore: partial, maxScore, isEssay: false };
      } catch { return { correct: false, partialScore: 0, maxScore, isEssay: false }; }
    }
    return { correct: false, partialScore: 0, maxScore, isEssay: false };
  }
  if (q.type === "matching") {
    const md = q.matchingData;
    if (!md) return { correct: false, partialScore: 0, maxScore, isEssay: false };
    const userMap = typeof answer === "object" ? (answer as Record<string, string>) : {};
    let correctMap: Record<string, string> = {};
    if (md.correctPairs && md.correctPairs.length > 0) {
      md.correctPairs.forEach(p => { correctMap[p.leftId] = p.rightId; });
    } else {
      try { correctMap = JSON.parse(q.correctAnswer || "{}"); } catch {}
      if (Object.keys(correctMap).length === 0 && !md.shuffleB) {
        md.leftItems.forEach((l, i) => { const r = md.rightItems[i]; if (r) correctMap[l.id] = r.id; });
      }
    }
    const totalPairs = Object.keys(correctMap).length;
    if (totalPairs === 0) return { correct: false, partialScore: 0, maxScore, isEssay: false };
    const perPair = md.scorePerPair > 0 ? md.scorePerPair : maxScore / totalPairs;
    const correctPairsCount = Object.entries(correctMap).filter(([lId, rId]) => userMap[lId] === rId).length;
    return { correct: correctPairsCount === totalPairs, partialScore: correctPairsCount * perPair, maxScore, isEssay: false };
  }
  return { correct: false, partialScore: 0, maxScore, isEssay: false };
}

// ─── Audio Player ─────────────────────────────────────────────────────────────

function SectionAudioPlayer({ audioInfo }: { audioInfo: AudioInfo }) {
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    return () => { sound?.unloadAsync().catch(() => {}); };
  }, [sound]);

  const onStatus = useCallback((status: any) => {
    if (!status.isLoaded) return;
    setPositionMs(status.positionMillis ?? 0);
    setDurationMs(status.durationMillis ?? 0);
    setIsPlaying(status.isPlaying ?? false);
    if (status.didJustFinish) setPositionMs(0);
  }, []);

  const handlePlayPause = async () => {
    if (loading) return;
    if (!sound) {
      setLoading(true);
      try {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
        const { sound: s } = await Audio.Sound.createAsync(
          { uri: audioInfo.url },
          { shouldPlay: true },
          onStatus
        );
        setSound(s);
        setIsPlaying(true);
      } catch {
        Alert.alert("Lỗi", "Không thể tải file audio.");
      } finally {
        setLoading(false);
      }
      return;
    }
    if (isPlaying) {
      await sound.pauseAsync().catch(() => {});
    } else {
      await sound.playAsync().catch(() => {});
    }
  };

  const progress = durationMs > 0 ? positionMs / durationMs : 0;

  return (
    <View style={styles.audioPlayerBar}>
      <View style={styles.audioPlayerLeft}>
        <TouchableOpacity
          onPress={handlePlayPause}
          disabled={loading}
          style={styles.audioPlayBtn}
          activeOpacity={0.8}
        >
          {loading
            ? <ActivityIndicator size="small" color="#1d4ed8" />
            : <Feather name={isPlaying ? "pause" : "play"} size={16} color="#1d4ed8" />
          }
        </TouchableOpacity>
        <Text style={styles.audioTime}>
          {formatMs(positionMs)} / {durationMs > 0 ? formatMs(durationMs) : "--:--"}
        </Text>
      </View>
      <View style={styles.audioProgress}>
        <View style={[styles.audioProgressFill, { width: `${Math.round(progress * 100)}%` as any }]} />
      </View>
      <TouchableOpacity
        onPress={() => WebBrowser.openBrowserAsync(audioInfo.url).catch(() => {})}
        style={{ padding: 4 }}
      >
        <Feather name="external-link" size={14} color="#93c5fd" />
      </TouchableOpacity>
    </View>
  );
}

// ─── Single Choice ────────────────────────────────────────────────────────────

function SingleChoiceQ({
  sq, answer, onChange, colors,
}: {
  sq: SectionQuestion; answer: string | undefined;
  onChange: (v: string) => void; colors: ReturnType<typeof useColors>;
}) {
  const opts = sq.question.options ?? [];
  return (
    <View style={{ gap: 10 }}>
      {opts.map((opt) => {
        const sel = answer === opt.id;
        return (
          <TouchableOpacity
            key={opt.id}
            onPress={() => { onChange(opt.id); Haptics.selectionAsync(); }}
            activeOpacity={0.75}
            style={[styles.optionRow, { borderColor: sel ? "#be185d" : colors.border, backgroundColor: sel ? "#fdf2f8" : colors.card }]}
          >
            <View style={[styles.optionLabel, { backgroundColor: sel ? "#be185d" : colors.muted }]}>
              <Text style={{ color: sel ? "#fff" : colors.mutedForeground, fontFamily: "Inter_700Bold", fontSize: 13 }}>
                {opt.id}
              </Text>
            </View>
            <Text style={{ flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", color: colors.foreground, lineHeight: 20 }}>
              {opt.text}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Multiple Choice ──────────────────────────────────────────────────────────

function MultipleChoiceQ({
  sq, answer, onChange, colors,
}: {
  sq: SectionQuestion; answer: string | undefined;
  onChange: (v: string) => void; colors: ReturnType<typeof useColors>;
}) {
  const opts = sq.question.options ?? [];
  const selected = answer ? answer.split(",").filter(Boolean) : [];
  const toggle = (id: string) => {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    onChange(next.join(","));
    Haptics.selectionAsync();
  };
  return (
    <View style={{ gap: 10 }}>
      <View style={{ backgroundColor: "#eff6ff", borderRadius: 8, padding: 8, flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Feather name="layers" size={12} color="#1d4ed8" />
        <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: "#1d4ed8" }}>Chọn tất cả đáp án đúng</Text>
      </View>
      {opts.map((opt) => {
        const isSel = selected.includes(opt.id);
        return (
          <TouchableOpacity
            key={opt.id}
            onPress={() => toggle(opt.id)}
            activeOpacity={0.75}
            style={[styles.optionRow, { borderColor: isSel ? "#be185d" : colors.border, backgroundColor: isSel ? "#fdf2f8" : colors.card }]}
          >
            <View style={[styles.optionLabel, { backgroundColor: isSel ? "#be185d" : colors.muted, borderRadius: 6 }]}>
              <Text style={{ color: isSel ? "#fff" : colors.mutedForeground, fontFamily: "Inter_700Bold", fontSize: 13 }}>
                {opt.id}
              </Text>
            </View>
            <Text style={{ flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", color: colors.foreground, lineHeight: 20 }}>
              {opt.text}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Fill Blank ───────────────────────────────────────────────────────────────

function FillBlankQ({
  sq, answer, onChange, colors,
}: {
  sq: SectionQuestion; answer: Record<string, string> | undefined;
  onChange: (v: Record<string, string>) => void; colors: ReturnType<typeof useColors>;
}) {
  const parts = sq.question.contentParts ?? [];
  const current = answer ?? {};
  const setBlank = (blankId: string, val: string) => onChange({ ...current, [blankId]: val });
  if (parts.length === 0) return (
    <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>(Không có dữ liệu chỗ trống)</Text>
  );
  const blanks = parts.filter((p) => p.type === "blank");
  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center" }}>
        {parts.map((part, i) => {
          if (part.type === "text") {
            return (
              <Text key={i} style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: colors.foreground, lineHeight: 22 }}>
                {part.text}
              </Text>
            );
          }
          const val = current[part.blankId ?? ""] ?? "";
          return (
            <TextInput
              key={i}
              style={{ minWidth: 80, borderBottomWidth: 2, borderBottomColor: val ? "#be185d" : colors.border, fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#be185d", paddingHorizontal: 4, paddingVertical: 2, marginHorizontal: 4, textAlign: "center" }}
              value={val}
              onChangeText={(t) => setBlank(part.blankId!, t)}
              placeholder={`(${(part.index ?? 0) + 1})`}
              placeholderTextColor={colors.mutedForeground}
            />
          );
        })}
      </View>
      <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
        {blanks.filter((b) => current[b.blankId ?? ""]).length}/{blanks.length} chỗ trống đã điền
      </Text>
    </View>
  );
}

// ─── Essay ────────────────────────────────────────────────────────────────────

function EssayQ({ answer, onChange, colors }: { answer: string | undefined; onChange: (v: string) => void; colors: ReturnType<typeof useColors> }) {
  const text = answer ?? "";
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  return (
    <View>
      <View style={{ backgroundColor: "#fef9c3", borderRadius: 10, padding: 10, marginBottom: 10, flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Feather name="edit-3" size={13} color="#ca8a04" />
        <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: "#ca8a04" }}>Viết bài làm vào ô bên dưới</Text>
      </View>
      <TextInput
        style={[styles.essayInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]}
        multiline scrollEnabled={false}
        placeholder="Nhập bài làm của bạn..."
        placeholderTextColor={colors.mutedForeground}
        value={text}
        onChangeText={onChange}
        textAlignVertical="top"
      />
      <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 6 }}>Số từ: {wordCount}</Text>
    </View>
  );
}

// ─── Matching ─────────────────────────────────────────────────────────────────

function MatchingQ({
  sq, answer, onChange, colors,
}: {
  sq: SectionQuestion; answer: Record<string, string> | undefined;
  onChange: (v: Record<string, string>) => void; colors: ReturnType<typeof useColors>;
}) {
  const md = sq.question.matchingData;
  const [popupLeftId, setPopupLeftId] = useState<string | null>(null);

  if (!md) return null;
  const current = answer ?? {};
  const leftItems = md.leftItems;
  const rightItems = md.rightItems;

  // Set of rightItem ids already chosen by OTHER left items
  const chosenByOthers = new Set(
    Object.entries(current)
      .filter(([lId]) => lId !== popupLeftId)
      .map(([, rId]) => rId)
  );

  const handleSelect = (rightId: string) => {
    if (!popupLeftId) return;
    const next = { ...current };
    if (current[popupLeftId] === rightId) {
      delete next[popupLeftId]; // deselect if same
    } else {
      next[popupLeftId] = rightId;
    }
    onChange(next);
    setPopupLeftId(null);
    Haptics.selectionAsync();
  };

  return (
    <View style={{ gap: 10 }}>
      <View style={{ backgroundColor: "#fdf2f8", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 2 }}>
        <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: "#be185d", letterSpacing: 0.8 }}>CÂU HỎI NỐI</Text>
      </View>
      {leftItems.map((left) => {
        const chosenId = current[left.id];
        const chosenItem = rightItems.find((r) => r.id === chosenId);
        return (
          <TouchableOpacity
            key={left.id}
            onPress={() => { setPopupLeftId(left.id); Haptics.selectionAsync(); }}
            activeOpacity={0.8}
            style={[styles.matchRow, {
              borderColor: chosenItem ? "#be185d" : colors.border,
              backgroundColor: colors.card,
            }]}
          >
            <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: colors.foreground }}>
              {left.text}
            </Text>
            <View style={[styles.matchDropdown, {
              borderColor: chosenItem ? "#be185d" : colors.border,
              backgroundColor: chosenItem ? "#fdf2f8" : colors.muted,
            }]}>
              <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: chosenItem ? "#be185d" : colors.mutedForeground, flex: 1 }}>
                {chosenItem?.text ?? "— Chọn —"}
              </Text>
              <Feather name="chevron-down" size={14} color={chosenItem ? "#be185d" : colors.mutedForeground} />
            </View>
          </TouchableOpacity>
        );
      })}

      {/* Matching Popup */}
      <Modal visible={!!popupLeftId} transparent animationType="fade" onRequestClose={() => setPopupLeftId(null)}>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 24 }}
          activeOpacity={1}
          onPress={() => setPopupLeftId(null)}
        >
          <TouchableOpacity activeOpacity={1} style={[styles.matchPopup, { backgroundColor: colors.card }]} onPress={() => {}}>
            <View style={styles.matchPopupHeader}>
              <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: colors.foreground, flex: 1 }} numberOfLines={2}>
                {leftItems.find((l) => l.id === popupLeftId)?.text ?? ""}
              </Text>
              <TouchableOpacity onPress={() => setPopupLeftId(null)} style={{ padding: 4 }}>
                <Feather name="x" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginBottom: 10, paddingHorizontal: 16 }}>
              Chọn đáp án phù hợp
            </Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {rightItems.map((right, idx) => {
                const isChosen = popupLeftId ? current[popupLeftId] === right.id : false;
                const isUsedByOther = chosenByOthers.has(right.id);
                const rowBg = idx % 2 === 0 ? colors.card : colors.muted;
                return (
                  <TouchableOpacity
                    key={right.id}
                    onPress={() => !isUsedByOther && handleSelect(right.id)}
                    activeOpacity={isUsedByOther ? 1 : 0.75}
                    style={[styles.matchPopupRow, {
                      backgroundColor: rowBg,
                      opacity: isUsedByOther ? 0.38 : 1,
                    }]}
                  >
                    <View style={[styles.matchRadio, {
                      borderColor: isChosen ? "#be185d" : colors.border,
                      backgroundColor: isChosen ? "#be185d" : "transparent",
                    }]}>
                      {isChosen && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#fff" }} />}
                    </View>
                    <Text style={{ flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", color: isUsedByOther ? colors.mutedForeground : colors.foreground, lineHeight: 20 }}>
                      {right.text}
                    </Text>
                    {isUsedByOther && (
                      <Feather name="lock" size={13} color={colors.mutedForeground} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  exam: ExamData | null;
  onClose: () => void;
  onSubmit: (payload: ExamSubmitPayload) => Promise<void>;
}

const SECTION_TYPE_ICONS: Record<string, string> = {
  listening: "headphones",
  speaking: "mic",
  reading: "book-open",
  writing: "edit-3",
};

export default function ExamTakingScreen({ visible, exam, onClose, onSubmit }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<AllAnswers>({});
  const [submitting, setSubmitting] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [passageOpen, setPassageOpen] = useState(false);
  // "downloading" → đang fetch với auth, "native" → react-native-pdf file local, "webview" → Google Docs fallback, "error" → fallback cuối
  const [passagePdfStage, setPassagePdfStage] = useState<"downloading" | "native" | "webview" | "error">("downloading");
  const [passagePdfLoading, setPassagePdfLoading] = useState(true);
  const [passageLocalUri, setPassageLocalUri] = useState("");
  const passageDownloadRef = useRef<AbortController | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [resultData, setResultData] = useState<{
    answeredCount: number; totalQ: number; timeTakenSeconds: number;
    totalScore: number; maxScore: number; correctCount: number; incorrectCount: number; essayCount: number;
    sectionStats: { name: string; answered: number; total: number; correct: number; partialScore: number; maxScore: number }[];
  } | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const flat = exam ? buildFlat(exam.sections) : [];
  const totalQ = flat.length;

  const countAnswered = useCallback(() =>
    flat.filter((fq) => {
      const a = answers[fq.questionId];
      if (a === undefined || a === null) return false;
      if (typeof a === "string") return a.trim().length > 0;
      return Object.keys(a).length > 0;
    }).length, [flat, answers]);

  useEffect(() => {
    setPassageOpen(false);
  }, [currentIdx]);

  // Download PDF với auth header mỗi khi mở passage
  useEffect(() => {
    if (!passageOpen) {
      passageDownloadRef.current?.abort();
      return;
    }
    const section = exam?.sections[flat[currentIdx]?.sectionIdx ?? 0];
    const passageInfo = section?.passageInfo;
    if (!passageInfo || Platform.OS === "web") return;

    // Reset state mỗi lần mở
    setPassageLocalUri("");
    setPassagePdfStage("downloading");
    setPassagePdfLoading(true);

    const controller = new AbortController();
    passageDownloadRef.current = controller;

    void (async () => {
      try {
        const rawUrl = passageInfo.absoluteUrl || passageInfo.url;
        const absoluteUrl = (rawUrl.startsWith("http://") || rawUrl.startsWith("https://"))
          ? rawUrl
          : `${getCenterUrl() ?? ""}${rawUrl}`;

        // Tên file an toàn cho cache
        const safeName = passageInfo.name
          .replace(/[^\x20-\x7E]/g, "_")
          .replace(/[/\\:*?"<>|]/g, "_")
          .replace(/\s+/g, "_");
        const cacheFilename = safeName.toLowerCase().endsWith(".pdf")
          ? safeName
          : `${safeName}.pdf`;
        const localFile = new File(Paths.cache, cacheFilename);

        // Cache hit → dùng ngay, không download lại
        if (localFile.exists) {
          console.log(`[ExamTaking] PDF cache hit → "${localFile.uri}"`);
          if (!controller.signal.aborted) {
            setPassageLocalUri(localFile.uri);
            setPassagePdfStage("native");
          }
          return;
        }

        // Chỉ gửi Bearer cho URL nội bộ (relative gốc)
        const isInternal = !passageInfo.url.startsWith("http://") && !passageInfo.url.startsWith("https://");
        const token = getAuthToken();
        const headers: Record<string, string> = {};
        if (token && isInternal) headers["Authorization"] = `Bearer ${token}`;

        console.log(`[ExamTaking] PDF download: "${absoluteUrl}" isInternal=${isInternal}`);
        const res = await fetch(absoluteUrl, { headers, signal: controller.signal });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const ab = await res.arrayBuffer();
        if (ab.byteLength === 0) throw new Error("File trống (0 bytes)");

        localFile.write(new Uint8Array(ab));
        console.log(`[ExamTaking] PDF download xong — ${ab.byteLength} bytes → "${localFile.uri}"`);

        if (!controller.signal.aborted) {
          setPassageLocalUri(localFile.uri);
          setPassagePdfStage("native");
        }
      } catch (err: unknown) {
        if (controller.signal.aborted) return;
        console.warn("[ExamTaking] PDF download thất bại → fallback Google Docs:", err);
        setPassagePdfStage("webview");
        setPassagePdfLoading(true);
      }
    })();

    return () => controller.abort();
  }, [passageOpen, currentIdx, exam]);

  useEffect(() => {
    if (visible && exam) {
      setCurrentIdx(0);
      setAnswers({});
      setShowResult(false);
      setShowReview(false);
      setResultData(null);
      startTimeRef.current = Date.now();
      if (exam.timeLimitMinutes) {
        const secs = exam.timeLimitMinutes * 60;
        setTimeLeft(secs);
        timerRef.current = setInterval(() => {
          setTimeLeft((prev) => {
            if (prev === null || prev <= 1) { clearInterval(timerRef.current!); return 0; }
            return prev - 1;
          });
        }, 1000);
      } else {
        setTimeLeft(null);
      }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [visible, exam]);

  useEffect(() => { if (timeLeft === 0) doSubmit(); }, [timeLeft]);

  const currentFQ = flat[currentIdx];
  const currentSection = exam?.sections[currentFQ?.sectionIdx ?? 0];
  const prevSectionIdx = currentIdx > 0 ? flat[currentIdx - 1]?.sectionIdx : undefined;
  const sectionChanged = currentFQ?.sectionIdx !== prevSectionIdx;

  const sectionStats = exam?.sections.map((sec) => ({
    name: sec.name,
    total: sec.questions.length,
    answered: sec.questions.filter((sq) => {
      const a = answers[sq.questionId];
      if (!a) return false;
      if (typeof a === "string") return a.trim().length > 0;
      return Object.keys(a).length > 0;
    }).length,
  })) ?? [];

  const setAnswer = useCallback((questionId: string, val: QuestionAnswer) => {
    setAnswers((prev) => ({ ...prev, [questionId]: val }));
  }, []);

  const go = (delta: number) => {
    const next = currentIdx + delta;
    if (next < 0 || next >= totalQ) return;
    setCurrentIdx(next);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    Haptics.selectionAsync();
  };

  const calcPayload = (): Omit<ExamSubmitPayload, "answers"> => {
    const timeTakenSeconds = Math.round((Date.now() - startTimeRef.current) / 1000);
    const partScores: PartScore[] = (exam?.sections ?? []).map((sec) => ({
      partName: sec.name,
      total: sec.questions.length,
      correct: 0,
      score: 0,
    }));
    return { score: "0.00", partScores, timeTakenSeconds };
  };

  const doSubmit = async () => {
    if (submitting) return;
    if (timerRef.current) clearInterval(timerRef.current);
    setSubmitting(true);

    const timeTakenSeconds = Math.round((Date.now() - startTimeRef.current) / 1000);
    const answered = countAnswered();

    // Score all questions
    let totalScore = 0;
    let maxScoreTotal = 0;
    let correctCount = 0;
    let incorrectCount = 0;
    let essayCount = 0;

    const secScores = (exam?.sections ?? []).map((sec) => {
      let secCorrect = 0;
      let secPartial = 0;
      let secMax = 0;
      let secAnswered = 0;
      sec.questions.forEach((sq) => {
        const a = answers[sq.questionId];
        const hasAnswer = a !== undefined && a !== null && (typeof a === "string" ? a.trim().length > 0 : Object.keys(a).length > 0);
        if (hasAnswer) secAnswered++;
        const s = scoreQuestion(sq, a);
        secPartial += s.partialScore;
        secMax += s.maxScore;
        if (s.isEssay) { essayCount++; }
        else if (hasAnswer) {
          if (s.correct) { secCorrect++; correctCount++; }
          else { incorrectCount++; }
        }
        totalScore += s.partialScore;
        maxScoreTotal += s.maxScore;
      });
      return { name: sec.name, total: sec.questions.length, answered: secAnswered, correct: secCorrect, partialScore: secPartial, maxScore: secMax };
    });

    const partScores: PartScore[] = secScores.map((s) => ({
      partName: s.name, total: s.total, correct: s.correct, score: s.partialScore,
    }));
    const scoreStr = totalScore.toFixed(2);

    setResultData({ answeredCount: answered, totalQ: flat.length, timeTakenSeconds, totalScore, maxScore: maxScoreTotal, correctCount, incorrectCount, essayCount, sectionStats: secScores });
    setSubmitting(false);
    setShowResult(true);

    onSubmit({ answers, score: scoreStr, partScores, timeTakenSeconds }).catch(() => {});
  };

  const handleSubmitPress = () => {
    doSubmit();
  };

  const confirmExit = () => {
    Alert.alert(
      "Thoát bài kiểm tra",
      "Bài làm sẽ không được lưu. Bạn có muốn thoát không?",
      [
        { text: "Ở lại", style: "cancel" },
        { text: "Thoát", style: "destructive", onPress: onClose },
      ]
    );
  };

  const timerColor = timeLeft !== null && timeLeft < 60 ? "#ef4444" : "#be185d";
  const timerBg = timeLeft !== null && timeLeft < 60 ? "#fee2e2" : "#fdf2f8";
  const answeredCount = countAnswered();

  if (!exam) return null;

  const renderQuestion = () => {
    if (!currentFQ) return null;
    const q = currentFQ.question;
    const questionId = currentFQ.questionId;
    switch (q.type) {
      case "single_choice":
        return <SingleChoiceQ sq={currentFQ} answer={answers[questionId] as string | undefined} onChange={(v) => setAnswer(questionId, v)} colors={colors} />;
      case "multiple_choice":
        return <MultipleChoiceQ sq={currentFQ} answer={answers[questionId] as string | undefined} onChange={(v) => setAnswer(questionId, v)} colors={colors} />;
      case "fill_blank":
        return <FillBlankQ sq={currentFQ} answer={answers[questionId] as Record<string, string> | undefined} onChange={(v) => setAnswer(questionId, v)} colors={colors} />;
      case "essay":
        return <EssayQ answer={answers[questionId] as string | undefined} onChange={(v) => setAnswer(questionId, v)} colors={colors} />;
      case "matching":
        return <MatchingQ sq={currentFQ} answer={answers[questionId] as Record<string, string> | undefined} onChange={(v) => setAnswer(questionId, v)} colors={colors} />;
      default:
        return <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>Loại câu hỏi không hỗ trợ: {q.type}</Text>;
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={showResult ? onClose : confirmExit}>
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>

        {/* ── Result screen ── */}
        {showResult && resultData && !showReview && (
          <View style={{ flex: 1, backgroundColor: colors.background }}>
            <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 20 }} showsVerticalScrollIndicator={false}>
              {/* Success header */}
              <View style={{ alignItems: "center", paddingTop: 16, paddingBottom: 20 }}>
                <View style={{ backgroundColor: "#16a34a", width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
                  <Feather name="check" size={36} color="#fff" />
                </View>
                <Text style={{ fontSize: 21, fontFamily: "Inter_700Bold", color: colors.foreground, textAlign: "center" }}>Nộp bài thành công! 🎉</Text>
                <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 6, lineHeight: 19 }}>
                  Bài kiểm tra của bạn đã được ghi lại.
                </Text>
              </View>

              {/* Score banner */}
              <View style={{ backgroundColor: "#f0fdf4", borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1.5, borderColor: "#bbf7d0", alignItems: "center" }}>
                <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: "#15803d", marginBottom: 4 }}>ĐIỂM SỐ</Text>
                <Text style={{ fontSize: 36, fontFamily: "Inter_700Bold", color: "#15803d" }}>
                  {Number.isInteger(resultData.totalScore) ? resultData.totalScore : resultData.totalScore.toFixed(1)}
                  <Text style={{ fontSize: 18, fontFamily: "Inter_500Medium", color: "#16a34a" }}>
                    {" "}/ {Number.isInteger(resultData.maxScore) ? resultData.maxScore : resultData.maxScore.toFixed(1)} điểm
                  </Text>
                </Text>
                <View style={{ flexDirection: "row", gap: 20, marginTop: 10 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                    <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: "#16a34a", alignItems: "center", justifyContent: "center" }}>
                      <Feather name="check" size={12} color="#fff" />
                    </View>
                    <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#15803d" }}>Đúng: {resultData.correctCount}</Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                    <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: "#dc2626", alignItems: "center", justifyContent: "center" }}>
                      <Feather name="x" size={12} color="#fff" />
                    </View>
                    <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#dc2626" }}>Sai: {resultData.incorrectCount}</Text>
                  </View>
                  {resultData.essayCount > 0 && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                      <Feather name="edit-3" size={14} color="#ca8a04" />
                      <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: "#ca8a04" }}>Tự luận: {resultData.essayCount}</Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Time + answered */}
              <View style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}>
                <View style={{ flex: 1, backgroundColor: colors.card, borderRadius: 12, padding: 14, alignItems: "center", borderWidth: 1, borderColor: colors.border }}>
                  <Feather name="clock" size={18} color="#be185d" style={{ marginBottom: 4 }} />
                  <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: colors.foreground }}>
                    {Math.floor(resultData.timeTakenSeconds / 60)}:{String(resultData.timeTakenSeconds % 60).padStart(2, "0")}
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 2 }}>Thời gian</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: colors.card, borderRadius: 12, padding: 14, alignItems: "center", borderWidth: 1, borderColor: colors.border }}>
                  <Feather name="list" size={18} color="#2563eb" style={{ marginBottom: 4 }} />
                  <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: colors.foreground }}>
                    {resultData.answeredCount}/{resultData.totalQ}
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 2 }}>Đã trả lời</Text>
                </View>
              </View>

              {/* Section breakdown */}
              <View style={{ backgroundColor: colors.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 20 }}>
                <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground, marginBottom: 12 }}>Chi tiết theo phần</Text>
                {resultData.sectionStats.map((sec, i) => {
                  const nonEssayTotal = sec.total - (exam?.sections[i]?.questions.filter(sq => sq.question.type === "essay").length ?? 0);
                  const pct = nonEssayTotal > 0 ? sec.correct / nonEssayTotal : 0;
                  return (
                    <View key={i} style={{ marginBottom: i < resultData.sectionStats.length - 1 ? 14 : 0 }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                        <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: colors.foreground, flex: 1 }} numberOfLines={1}>{sec.name}</Text>
                        <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: pct === 1 ? "#16a34a" : "#be185d" }}>
                          {sec.correct}/{nonEssayTotal} đúng
                        </Text>
                      </View>
                      <View style={{ height: 5, borderRadius: 3, backgroundColor: colors.border, overflow: "hidden" }}>
                        <View style={{ height: "100%" as any, width: `${pct * 100}%`, backgroundColor: pct === 1 ? "#16a34a" : "#be185d", borderRadius: 3 }} />
                      </View>
                    </View>
                  );
                })}
              </View>
            </ScrollView>

            {/* Buttons */}
            <View style={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border, gap: 8 }}>
              <TouchableOpacity onPress={() => setShowReview(true)} style={{ borderRadius: 12, overflow: "hidden" }}>
                <View style={{ backgroundColor: "#2563eb", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 13 }}>
                  <Feather name="eye" size={15} color="#fff" />
                  <Text style={{ color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" }}>Xem kết quả & đáp án</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} style={{ borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, paddingVertical: 13, alignItems: "center" }}>
                <Text style={{ color: colors.mutedForeground, fontSize: 14, fontFamily: "Inter_500Medium" }}>Đóng</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Review screen ── */}
        {showResult && resultData && showReview && (
          <View style={{ flex: 1, backgroundColor: colors.background }}>
            {/* Review header */}
            <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.card }}>
              <TouchableOpacity onPress={() => setShowReview(false)} style={{ padding: 4, marginRight: 8 }}>
                <Feather name="arrow-left" size={20} color={colors.foreground} />
              </TouchableOpacity>
              <Text style={{ flex: 1, fontSize: 16, fontFamily: "Inter_700Bold", color: colors.foreground }}>Kết quả & Đáp án</Text>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: "#16a34a", alignItems: "center", justifyContent: "center" }}>
                    <Feather name="check" size={10} color="#fff" />
                  </View>
                  <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#15803d" }}>{resultData.correctCount}</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: "#dc2626", alignItems: "center", justifyContent: "center" }}>
                    <Feather name="x" size={10} color="#fff" />
                  </View>
                  <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#dc2626" }}>{resultData.incorrectCount}</Text>
                </View>
              </View>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {flat.map((fq, idx) => {
                const q = fq.question;
                const userAnswer = answers[fq.questionId];
                const sc = scoreQuestion(fq, userAnswer);
                const hasAnswer = userAnswer !== undefined && userAnswer !== null && (typeof userAnswer === "string" ? userAnswer.trim().length > 0 : Object.keys(userAnswer).length > 0);
                const borderColor = sc.isEssay ? colors.border : (sc.correct ? "#16a34a" : (hasAnswer ? "#dc2626" : colors.border));
                const bgColor = sc.isEssay ? colors.card : (sc.correct ? "#f0fdf4" : (hasAnswer ? "#fff1f2" : colors.card));

                return (
                  <View key={fq.questionId} style={{ marginHorizontal: 14, marginTop: 12, borderRadius: 12, borderWidth: 1.5, borderColor, backgroundColor: bgColor, padding: 14 }}>
                    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                      <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: sc.isEssay ? "#fef9c3" : (sc.correct ? "#16a34a" : (hasAnswer ? "#dc2626" : colors.border)), flexShrink: 0 }}>
                        {sc.isEssay
                          ? <Feather name="edit-3" size={12} color="#ca8a04" />
                          : <Feather name={sc.correct ? "check" : (hasAnswer ? "x" : "minus")} size={12} color="#fff" />
                        }
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: sc.isEssay ? "#ca8a04" : (sc.correct ? "#15803d" : (hasAnswer ? "#dc2626" : colors.mutedForeground)), marginBottom: 2 }}>
                          CÂU {idx + 1} · {sc.maxScore} điểm {sc.isEssay ? "· Giáo viên chấm" : sc.correct ? "· Đúng" : hasAnswer ? "· Sai" : "· Bỏ qua"}
                        </Text>
                        <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: colors.foreground, lineHeight: 20 }} numberOfLines={3}>{q.content}</Text>
                      </View>
                    </View>

                    {/* Answers for choice questions */}
                    {(q.type === "single_choice" || q.type === "multiple_choice") && q.options && (
                      <View style={{ gap: 6, marginTop: 4 }}>
                        {q.options.map((opt) => {
                          const userIds = q.type === "multiple_choice" ? String(userAnswer ?? "").split(",").filter(Boolean) : [String(userAnswer ?? "")];
                          const isUserAnswer = userIds.includes(opt.id);
                          const correctIds = q.type === "multiple_choice"
                            ? (q.correctAnswer || "").split(",").map(s => s.trim()).filter(Boolean)
                            : [q.correctAnswer?.trim() ?? ""];
                          const isCorrectAnswer = correctIds.includes(opt.id);
                          const rowBg = isCorrectAnswer ? "#f0fdf4" : isUserAnswer ? "#fff1f2" : colors.background;
                          const rowBorder = isCorrectAnswer ? "#16a34a" : isUserAnswer ? "#dc2626" : colors.border;
                          if (!isUserAnswer && !isCorrectAnswer) return null;
                          return (
                            <View key={opt.id} style={{ flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 8, borderWidth: 1, borderColor: rowBorder, backgroundColor: rowBg, padding: 8 }}>
                              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: rowBorder, alignItems: "center", justifyContent: "center" }}>
                                <Text style={{ color: "#fff", fontSize: 11, fontFamily: "Inter_700Bold" }}>{opt.id}</Text>
                              </View>
                              <Text style={{ flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: colors.foreground }}>{opt.text}</Text>
                              {isCorrectAnswer && <Feather name="check-circle" size={14} color="#16a34a" />}
                              {isUserAnswer && !isCorrectAnswer && <Feather name="x-circle" size={14} color="#dc2626" />}
                            </View>
                          );
                        })}
                        {!hasAnswer && q.correctAnswer && (
                          <View style={{ borderRadius: 8, borderWidth: 1, borderColor: "#16a34a", backgroundColor: "#f0fdf4", padding: 8 }}>
                            <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: "#15803d" }}>Đáp án: {q.correctAnswer}</Text>
                          </View>
                        )}
                      </View>
                    )}

                    {/* Matching answer display */}
                    {q.type === "matching" && q.matchingData && (
                      <View style={{ gap: 5, marginTop: 4 }}>
                        {(() => {
                          const md = q.matchingData!;
                          let correctMap: Record<string, string> = {};
                          if (md.correctPairs && md.correctPairs.length > 0) {
                            md.correctPairs.forEach(p => { correctMap[p.leftId] = p.rightId; });
                          } else {
                            try { correctMap = JSON.parse(q.correctAnswer || "{}"); } catch {}
                            if (Object.keys(correctMap).length === 0 && !md.shuffleB) {
                              md.leftItems.forEach((l, i) => { const r = md.rightItems[i]; if (r) correctMap[l.id] = r.id; });
                            }
                          }
                          const userMap = typeof userAnswer === "object" ? (userAnswer as Record<string, string>) : {};
                          return md.leftItems.map((left) => {
                            const userRightId = userMap[left.id];
                            const correctRightId = correctMap[left.id];
                            const userRight = md.rightItems.find(r => r.id === userRightId);
                            const correctRight = md.rightItems.find(r => r.id === correctRightId);
                            const isPairCorrect = userRightId === correctRightId;
                            return (
                              <View key={left.id} style={{ borderRadius: 8, borderWidth: 1, borderColor: isPairCorrect ? "#16a34a" : "#dc2626", backgroundColor: isPairCorrect ? "#f0fdf4" : "#fff1f2", padding: 8 }}>
                                <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>{left.text}</Text>
                                {userRight && <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: isPairCorrect ? "#15803d" : "#dc2626", marginTop: 2 }}>Bạn chọn: {userRight.text}</Text>}
                                {!isPairCorrect && correctRight && <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: "#15803d", marginTop: 2 }}>Đáp án: {correctRight.text}</Text>}
                              </View>
                            );
                          });
                        })()}
                      </View>
                    )}

                    {/* Essay display */}
                    {q.type === "essay" && (
                      <View style={{ marginTop: 4, gap: 8 }}>
                        <View style={{ borderRadius: 8, backgroundColor: colors.muted, padding: 10 }}>
                          <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.foreground, lineHeight: 18 }}>
                            {userAnswer ? String(userAnswer) : <Text style={{ color: colors.mutedForeground, fontStyle: "italic" }}>Không có bài làm</Text>}
                          </Text>
                        </View>
                        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6, backgroundColor: "#fefce8", borderRadius: 8, borderWidth: 1, borderColor: "#fde047", padding: 10 }}>
                          <Feather name="info" size={13} color="#ca8a04" style={{ marginTop: 1 }} />
                          <Text style={{ flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", color: "#92400e", lineHeight: 18 }}>
                            Các câu tự luận sẽ được giáo viên xem lại và trả điểm sau.
                          </Text>
                        </View>
                      </View>
                    )}
                  </View>
                );
              })}
              <View style={{ height: insets.bottom + 24 }} />
            </ScrollView>

            <View style={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
              <TouchableOpacity onPress={onClose} style={{ borderRadius: 12, overflow: "hidden" }}>
                <View style={{ backgroundColor: "#be185d", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 13 }}>
                  <Feather name="x" size={15} color="#fff" />
                  <Text style={{ color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" }}>Đóng</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Top bar ── */}
        {!showResult && (<>
        <View style={[styles.topBar, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
          <TouchableOpacity onPress={confirmExit} style={[styles.topCloseBtn, { backgroundColor: "#fdf2f8" }]}>
            <Feather name="x" size={18} color="#be185d" />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={[styles.questionCounter, { color: colors.foreground }]}>
              Câu {currentIdx + 1} / {totalQ}
            </Text>
            <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>
              {answeredCount}/{totalQ} đã trả lời
            </Text>
          </View>
          {timeLeft !== null ? (
            <View style={[styles.timerBox, { borderColor: timerColor, backgroundColor: timerBg }]}>
              <Feather name="clock" size={13} color={timerColor} />
              <Text style={[styles.timerText, { color: timerColor }]}>{formatTime(timeLeft)}</Text>
            </View>
          ) : (
            <View style={{ width: 70 }} />
          )}
        </View>

        {/* ── Section tabs ── */}
        <ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          style={[styles.sectionTabs, { borderBottomColor: colors.border }]}
          contentContainerStyle={{ paddingHorizontal: 12, gap: 8, paddingVertical: 8 }}
        >
          {(exam.sections ?? []).map((sec, i) => {
            const isActive = currentFQ?.sectionIdx === i;
            const firstIdx = flat.findIndex((fq) => fq.sectionIdx === i);
            const stat = sectionStats[i];
            const icon = SECTION_TYPE_ICONS[sec.type] ?? "file-text";
            return (
              <TouchableOpacity
                key={sec.id}
                onPress={() => { setCurrentIdx(firstIdx); Haptics.selectionAsync(); }}
                style={[styles.sectionTab, { backgroundColor: isActive ? "#be185d" : colors.card, borderColor: isActive ? "#be185d" : colors.border }]}
              >
                <Feather name={icon as any} size={11} color={isActive ? "#fff" : colors.mutedForeground} />
                <Text style={[styles.sectionTabText, { color: isActive ? "#fff" : colors.mutedForeground }]}>
                  {sec.name} {stat?.answered}/{stat?.total}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* ── Section audio: persistent player bar ── */}
        {currentSection?.audioInfo && (
          <View style={[styles.audioBarWrap, { backgroundColor: "#dbeafe", borderBottomColor: "#bfdbfe" }]}>
            <SectionAudioPlayer audioInfo={currentSection.audioInfo} key={currentSection.id} />
          </View>
        )}

        {/* ── Passage: expandable inline viewer ── */}
        {currentSection?.passageInfo && (() => {
          const passageUrl = currentSection.passageInfo!.viewerUrl
            || currentSection.passageInfo!.absoluteUrl
            || currentSection.passageInfo!.url;
          // react-native-pdf cần URL file trực tiếp, không phải URL viewer (Google Docs...)
          const passageDirectUrl = currentSection.passageInfo!.absoluteUrl
            || currentSection.passageInfo!.url;
          return (
            <View>
              <TouchableOpacity
                style={[styles.passageBar, { borderBottomColor: colors.border, backgroundColor: "#f0fdf4" }]}
                onPress={() => setPassageOpen(v => !v)}
                activeOpacity={0.8}
              >
                <Feather name="file-text" size={14} color="#16a34a" />
                <Text style={{ flex: 1, fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#16a34a" }} numberOfLines={1}>
                  {passageOpen ? `Bài đọc – ${currentSection.passageInfo!.name}` : currentSection.passageInfo!.name}
                </Text>
                <TouchableOpacity
                  onPress={() => WebBrowser.openBrowserAsync(passageUrl).catch(() => {})}
                  hitSlop={8}
                  style={{ padding: 2 }}
                >
                  <Feather name="external-link" size={14} color="#16a34a" />
                </TouchableOpacity>
                <View style={{ backgroundColor: passageOpen ? "#6b7280" : "#16a34a", paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10 }}>
                  <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#fff" }}>{passageOpen ? "Đóng" : "Mở"}</Text>
                </View>
              </TouchableOpacity>
              {passageOpen && (
                <View style={{ height: 340, overflow: "hidden", borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: "#fff" }}>
                  {Platform.OS === "web" ? (
                    // Web: iframe Google Docs (chỉ cần cho web, không có vấn đề auth)
                    // @ts-ignore — iframe is valid on web
                    <iframe
                      src={`https://docs.google.com/viewer?url=${encodeURIComponent(passageUrl)}&embedded=true`}
                      style={{ width: "100%", height: "100%", border: "none" }}
                      title="Bài đọc"
                    />
                  ) : (
                    // Native: download-to-cache (auth) → react-native-pdf → Google Docs → error
                    <>
                      {/* Loading overlay: đang download hoặc đang render PDF/Google Docs */}
                      {passagePdfLoading && passagePdfStage !== "error" && (
                        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 10, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" }}>
                          <ActivityIndicator size="small" color="#16a34a" />
                          {(passagePdfStage === "downloading" || passagePdfStage === "webview") && (
                            <Text style={{ fontSize: 12, color: "#6b7280", fontFamily: "Inter_400Regular", marginTop: 8 }}>
                              {passagePdfStage === "webview" ? "Đang tải qua Google Docs…" : "Đang tải bài đọc…"}
                            </Text>
                          )}
                        </View>
                      )}

                      {/* Tầng 1: react-native-pdf đọc file local (sau khi download xong) */}
                      {passagePdfStage === "native" && passageLocalUri !== "" && (
                        <Pdf
                          source={{ uri: passageLocalUri, cache: false }}
                          style={{ flex: 1, width: "100%" as any, backgroundColor: "#fff" }}
                          enablePaging={false}
                          onLoadComplete={() => setPassagePdfLoading(false)}
                          onError={(err) => {
                            console.warn("[ExamTaking] react-native-pdf lỗi → fallback Google Docs:", err);
                            setPassagePdfStage("webview");
                            setPassagePdfLoading(true);
                          }}
                        />
                      )}

                      {/* Tầng 2: Google Docs Viewer — fallback khi download thất bại */}
                      {passagePdfStage === "webview" && (
                        <WebView
                          key={`https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(passageDirectUrl)}`}
                          source={{ uri: `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(passageDirectUrl)}` }}
                          style={{ flex: 1 }}
                          onLoadEnd={() => setPassagePdfLoading(false)}
                          onError={() => { setPassagePdfLoading(false); setPassagePdfStage("error"); }}
                          onHttpError={(e) => {
                            if (e.nativeEvent.statusCode >= 400) {
                              setPassagePdfLoading(false);
                              setPassagePdfStage("error");
                            }
                          }}
                          javaScriptEnabled
                          domStorageEnabled
                          androidLayerType="hardware"
                        />
                      )}

                      {/* Tầng 3: tất cả fallback thất bại */}
                      {passagePdfStage === "error" && (
                        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 }}>
                          <Feather name="alert-circle" size={28} color="#ef4444" />
                          <Text style={{ fontSize: 13, color: "#374151", textAlign: "center", fontFamily: "Inter_400Regular" }}>
                            Không thể tải PDF
                          </Text>
                          <TouchableOpacity
                            onPress={() => WebBrowser.openBrowserAsync(passageDirectUrl).catch(() => {})}
                            style={{ backgroundColor: "#16a34a", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 }}
                          >
                            <Text style={{ color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" }}>Mở trình duyệt</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </>
                  )}
                </View>
              )}
            </View>
          );
        })()}

        {/* ── Question body ── */}
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {currentFQ ? (
            <>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
                <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: "#be185d", letterSpacing: 0.5 }}>
                  CÂU {currentIdx + 1}
                </Text>
                <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: colors.mutedForeground }}>
                  · {parseFloat(currentFQ.question.score).toFixed(2)} điểm
                </Text>
                {currentFQ.question.title && (
                  <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: colors.mutedForeground }}>
                    · {currentFQ.question.title}
                  </Text>
                )}
              </View>

              <Text style={[styles.questionText, { color: colors.foreground }]}>
                {currentFQ.question.content}
              </Text>

              {/* Question-level audio */}
              {currentFQ.question.mediaAudioUrl && (
                <View style={{ marginBottom: 12, borderRadius: 12, overflow: "hidden", backgroundColor: "#f0f9ff", borderWidth: 1, borderColor: "#bae6fd" }}>
                  <SectionAudioPlayer audioInfo={{ url: currentFQ.question.mediaAudioUrl, name: "Audio đính kèm" }} key={currentFQ.questionId + "-audio"} />
                </View>
              )}

              <View style={{ marginTop: 12 }}>
                {renderQuestion()}
              </View>
            </>
          ) : (
            <View style={{ alignItems: "center", paddingVertical: 40 }}>
              <Text style={{ color: colors.mutedForeground, fontSize: 14 }}>Không có câu hỏi</Text>
            </View>
          )}
        </ScrollView>

        {/* ── Question navigator dots ── */}
        <View style={[styles.qNavContainer, { borderTopColor: colors.border, backgroundColor: colors.card }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 6, paddingVertical: 6 }}>
            {flat.map((fq, i) => {
              const isActive = i === currentIdx;
              const a = answers[fq.questionId];
              const isAnswered = a !== undefined && a !== null && (typeof a === "string" ? a.trim().length > 0 : Object.keys(a).length > 0);
              return (
                <TouchableOpacity
                  key={fq.questionId}
                  onPress={() => { setCurrentIdx(i); scrollRef.current?.scrollTo({ y: 0, animated: false }); Haptics.selectionAsync(); }}
                  style={[styles.qNavDot, { backgroundColor: isActive ? "#be185d" : isAnswered ? "#fdf2f8" : colors.muted, borderColor: isActive ? "#be185d" : isAnswered ? "#f9a8d4" : colors.border }]}
                >
                  <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: isActive ? "#fff" : isAnswered ? "#be185d" : colors.mutedForeground }}>
                    {i + 1}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* ── Bottom nav ── */}
        <View style={[styles.bottomNav, { borderTopColor: colors.border, backgroundColor: colors.card }]}>
          <TouchableOpacity
            onPress={() => go(-1)}
            disabled={currentIdx === 0}
            style={[styles.navBtnSide, { opacity: currentIdx === 0 ? 0.3 : 1, borderColor: colors.border }]}
          >
            <Feather name="chevron-left" size={18} color={colors.foreground} />
            <Text style={[styles.navBtnText, { color: colors.foreground }]}>Câu trước</Text>
          </TouchableOpacity>

          {currentIdx < totalQ - 1 ? (
            <TouchableOpacity onPress={() => go(1)} style={styles.nextBtn}>
              <View style={[styles.nextBtnGrad, { backgroundColor: "#ec4899" }]}>
                <Text style={styles.nextBtnText}>Câu tiếp theo</Text>
                <Feather name="chevron-right" size={16} color="#fff" />
              </View>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={handleSubmitPress} disabled={submitting} style={[styles.nextBtn, { opacity: submitting ? 0.7 : 1 }]}>
              <View style={[styles.nextBtnGrad, { backgroundColor: "#16a34a" }]}>
                {submitting
                  ? <ActivityIndicator color="#fff" size="small" />
                  : (<><Feather name="send" size={15} color="#fff" /><Text style={styles.nextBtnText}>Nộp bài</Text></>)}
              </View>
            </TouchableOpacity>
          )}
        </View>
        </>)}

      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1,
  },
  topCloseBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  questionCounter: { fontSize: 15, fontFamily: "Inter_700Bold" },
  timerBox: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  timerText: { fontSize: 14, fontFamily: "Inter_700Bold" },
  sectionTabs: { borderBottomWidth: 1, maxHeight: 52 },
  sectionTab: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, flexDirection: "row", alignItems: "center", gap: 5 },
  sectionTabText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  // Audio player
  audioBarWrap: { borderBottomWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  audioPlayerBar: { flexDirection: "row", alignItems: "center", gap: 10 },
  audioPlayerLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  audioPlayBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  audioTime: { fontSize: 12, fontFamily: "Inter_500Medium", color: "#1e40af", minWidth: 80 },
  audioProgress: { flex: 1, height: 4, borderRadius: 2, backgroundColor: "#bfdbfe", overflow: "hidden" },
  audioProgressFill: { height: "100%" as any, backgroundColor: "#1d4ed8", borderRadius: 2 },

  // Passage bar
  passageBar: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1 },

  // Question
  questionText: { fontSize: 15, fontFamily: "Inter_600SemiBold", lineHeight: 22, marginBottom: 4 },
  optionRow: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1.5, borderRadius: 12, padding: 12 },
  optionLabel: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  essayInput: { minHeight: 160, fontSize: 14, fontFamily: "Inter_400Regular", borderWidth: 1.5, borderRadius: 12, padding: 12, lineHeight: 22 },

  // Matching
  matchRow: { flexDirection: "column", gap: 8, borderWidth: 1, borderRadius: 12, padding: 12 },
  matchDropdown: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  matchPopup: { width: "100%", borderRadius: 20, overflow: "hidden", shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 20, elevation: 10 },
  matchPopupHeader: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 10 },
  matchPopupRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  matchRadio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: "center", justifyContent: "center" },

  // Nav
  qNavContainer: { borderTopWidth: 1, maxHeight: 54 },
  qNavDot: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", borderWidth: 1.5 },
  bottomNav: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, paddingBottom: Platform.OS === "ios" ? 28 : 12 },
  navBtnSide: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  navBtnText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  nextBtn: { flex: 1, borderRadius: 10, overflow: "hidden" },
  nextBtnGrad: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12 },
  nextBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
