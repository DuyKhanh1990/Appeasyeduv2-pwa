import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "@/hooks/useSafeAreaInsets";

import { CommentRichEditor } from "@/components/CommentRichEditor";
import { useColors } from "@/hooks/useColors";
import { apiGet, apiPost, apiPut } from "@/lib/api";



interface Student {
  id: string;
  fullName: string;
  code: string;
}

interface ScoreCategory {
  id: string;
  name: string;
  code: string;
}

interface ScoreSheetItem {
  id: string;
  scoreSheetId: string;
  categoryId: string;
  formula: string;
  order: number;
  category: ScoreCategory | null;
}

interface ScoreSheet {
  id: string;
  name: string;
  items: ScoreSheetItem[];
}

interface ClassSession {
  id: string;
  sessionIndex: number;
  sessionDate: string;
  weekday: number;
  startTime: string;
  endTime: string;
}

interface ExistingScore {
  id: string;
  gradeBookId: string;
  studentId: string;
  categoryId: string;
  score: string;
}

function isComputed(formula: string): boolean {
  if (!formula || formula.trim() === "") return false;
  const stripped = formula.replace(/^=\s*/, "").trim();
  return /[+\-*/()]/.test(stripped);
}

function computeForStudent(formula: string, categoryCodeToValue: Record<string, string>): string {
  try {
    let expr = formula.startsWith("=") ? formula.slice(1).trim() : formula;
    for (const [code, val] of Object.entries(categoryCodeToValue)) {
      const num = parseFloat(val) || 0;
      expr = expr.replace(new RegExp(`\\b${code}\\b`, "g"), String(num));
    }
    // eslint-disable-next-line no-new-func
    const result = new Function(`"use strict"; return (${expr})`)();
    if (typeof result === "number" && !isNaN(result) && isFinite(result)) {
      return result.toFixed(1);
    }
    return "";
  } catch {
    return "";
  }
}

function formatSessionDate(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("vi-VN", { day: "numeric", month: "numeric", year: "numeric" });
}

function PickerModal<T>({
  visible,
  title,
  items,
  selectedId,
  onSelect,
  onClose,
  renderLabel,
  colors,
}: {
  visible: boolean;
  title: string;
  items: T[];
  selectedId: string | null;
  onSelect: (item: T) => void;
  onClose: () => void;
  renderLabel: (item: T) => string;
  getItemId: (item: T) => string;
  colors: ReturnType<typeof useColors>;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)" }} activeOpacity={1} onPress={onClose} />
      <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "60%", paddingBottom: insets.bottom + 16 }}>
        <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: colors.foreground }}>{title}</Text>
          <TouchableOpacity onPress={onClose}><Feather name="x" size={20} color={colors.mutedForeground} /></TouchableOpacity>
        </View>
        <ScrollView showsVerticalScrollIndicator={false}>
          {items.map((item: any) => {
            const itemId = item.id;
            const isSelected = itemId === selectedId;
            return (
              <TouchableOpacity
                key={itemId}
                onPress={() => { onSelect(item); onClose(); Haptics.selectionAsync(); }}
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}
              >
                <Text style={{ fontSize: 14, fontFamily: isSelected ? "Inter_600SemiBold" : "Inter_400Regular", color: isSelected ? colors.primary : colors.foreground }}>
                  {renderLabel(item)}
                </Text>
                {isSelected && <Feather name="check" size={16} color={colors.primary} />}
              </TouchableOpacity>
            );
          })}
          {items.length === 0 && (
            <View style={{ padding: 32, alignItems: "center" }}>
              <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>Không có dữ liệu</Text>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function StaffGradeBookEditScreen() {
  const params = useLocalSearchParams<{ classId: string; id?: string }>();
  const classId = params.classId;
  const gradeBookId = params.id;
  const isEditing = !!gradeBookId;
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [selectedSheetId, setSelectedSheetId] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [published, setPublished] = useState(false);
  const [scores, setScores] = useState<Record<string, Record<string, string>>>({});
  const [comments, setComments] = useState<Record<string, string>>({});

  const [students, setStudents] = useState<Student[]>([]);
  const [sheets, setSheets] = useState<ScoreSheet[]>([]);
  const [sessions, setSessions] = useState<ClassSession[]>([]);

  const [sheetPickerVisible, setSheetPickerVisible] = useState(false);
  const [sessionPickerVisible, setSessionPickerVisible] = useState(false);
  const [commentModalStudentId, setCommentModalStudentId] = useState<string | null>(null);

  const selectedSheet = sheets.find((s) => s.id === selectedSheetId) ?? null;
  const categories = (selectedSheet?.items ?? []).sort((a, b) => a.order - b.order);

  const getCategoryCodeToValue = (studentId: string): Record<string, string> => {
    const result: Record<string, string> = {};
    for (const item of categories) {
      if (item.category) {
        const code = item.category.code;
        const val = scores[studentId]?.[item.categoryId] ?? "";
        result[code] = val;
      }
    }
    return result;
  };

  const getComputedValue = (item: ScoreSheetItem, studentId: string): string => {
    if (!isComputed(item.formula)) return scores[studentId]?.[item.categoryId] ?? "";
    const codeToVal = getCategoryCodeToValue(studentId);
    return computeForStudent(item.formula, codeToVal);
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [studentsData, sheetsData, sessionsData] = await Promise.all([
        apiGet<Student[]>(`/api/mobile/staff/classes/${classId}/active-students`),
        apiGet<ScoreSheet[]>("/api/mobile/score-sheets"),
        apiGet<ClassSession[]>(`/api/mobile/staff/classes/${classId}/sessions`),
      ]);
      setStudents(studentsData);
      setSheets(sheetsData);
      setSessions(sessionsData.sort((a, b) => (a.sessionIndex ?? 0) - (b.sessionIndex ?? 0)));

      if (isEditing) {
        const [gbList, gbDetail] = await Promise.all([
          apiGet<any[]>(`/api/mobile/staff/classes/${classId}/grade-books`),
          apiGet<{ scores: ExistingScore[]; studentComments: Record<string, string> }>(`/api/mobile/staff/classes/${classId}/grade-books/${gradeBookId}`),
        ]);
        const gb = gbList.find((g: any) => g.id === gradeBookId);
        if (gb) {
          setTitle(gb.title);
          setSelectedSheetId(gb.scoreSheetId);
          setSelectedSessionId(gb.sessionId);
          setPublished(gb.published);
        }
        const scoreMap: Record<string, Record<string, string>> = {};
        for (const s of gbDetail.scores) {
          if (!scoreMap[s.studentId]) scoreMap[s.studentId] = {};
          scoreMap[s.studentId][s.categoryId] = s.score;
        }
        setScores(scoreMap);
        setComments(gbDetail.studentComments ?? {});
      } else if (sheetsData.length > 0) {
        setSelectedSheetId(sheetsData[0].id);
      }
    } catch (err) {
      Alert.alert("Lỗi", "Không tải được dữ liệu. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  const setScore = (studentId: string, categoryId: string, value: string) => {
    setScores((prev) => ({
      ...prev,
      [studentId]: { ...(prev[studentId] ?? {}), [categoryId]: value },
    }));
  };

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert("Thiếu thông tin", "Vui lòng nhập tiêu đề bảng điểm.");
      return;
    }
    setSaving(true);
    try {
      const scoreRows: { studentId: string; categoryId: string; score: string }[] = [];
      for (const student of students) {
        for (const item of categories) {
          let val = "";
          if (isComputed(item.formula)) {
            val = getComputedValue(item, student.id);
          } else {
            val = scores[student.id]?.[item.categoryId] ?? "";
          }
          if (val !== "") {
            scoreRows.push({ studentId: student.id, categoryId: item.categoryId, score: val });
          }
        }
      }

      const body = {
        title: title.trim(),
        scoreSheetId: selectedSheetId ?? undefined,
        sessionId: selectedSessionId ?? null,
        published,
        scores: scoreRows,
        studentComments: comments,
      };

      if (isEditing) {
        await apiPut(`/api/mobile/staff/classes/${classId}/grade-books/${gradeBookId}`, body);
      } else {
        await apiPost(`/api/mobile/staff/classes/${classId}/grade-books`, body);
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (err) {
      Alert.alert("Lỗi", "Không thể lưu bảng điểm. Vui lòng thử lại.");
    } finally {
      setSaving(false);
    }
  };


  const selectedSession = sessions.find((s) => s.id === selectedSessionId) ?? null;

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", gap: 14 }}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>Đang tải dữ liệu...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Header */}
      <View
        style={{ backgroundColor: colors.gradientStart, paddingTop: insets.top + 12, paddingBottom: 16, paddingHorizontal: 16 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <TouchableOpacity
            onPress={() => { Haptics.selectionAsync(); router.back(); }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(30,27,75,0.1)", alignItems: "center", justifyContent: "center" }}
          >
            <Feather name="arrow-left" size={20} color="#1e1b4b" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: "#1e1b4b" }}>
              {isEditing ? "Chỉnh sửa bảng điểm" : "Tạo bảng điểm mới"}
            </Text>
          </View>
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving}
            style={{ backgroundColor: "rgba(30,27,75,0.1)", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, flexDirection: "row", alignItems: "center", gap: 6 }}
          >
            {saving ? <ActivityIndicator size="small" color="#1e1b4b" /> : <Feather name="check" size={16} color="#1e1b4b" />}
            <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#1e1b4b" }}>Lưu</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Form */}
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <View style={{ padding: 16, gap: 14 }}>
          {/* Title */}
          <View style={[styles.formCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>Tiêu đề</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Nhập tiêu đề bảng điểm..."
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
            />
          </View>

          {/* Template + Session + Published */}
          <View style={[styles.formCard, { backgroundColor: colors.card, borderColor: colors.border, gap: 0 }]}>
            {/* Template picker */}
            <TouchableOpacity
              onPress={() => setSheetPickerVisible(true)}
              style={[styles.pickerRow, { borderBottomColor: colors.border }]}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                <Feather name="file-text" size={15} color={colors.primary} />
                <Text style={[styles.label, { color: colors.mutedForeground, marginBottom: 0 }]}>Mẫu điểm</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: selectedSheet ? colors.foreground : colors.mutedForeground }} numberOfLines={1}>
                  {selectedSheet ? selectedSheet.name : "Chọn mẫu..."}
                </Text>
                <Feather name="chevron-right" size={15} color={colors.mutedForeground} />
              </View>
            </TouchableOpacity>

            {/* Session picker */}
            <TouchableOpacity
              onPress={() => setSessionPickerVisible(true)}
              style={[styles.pickerRow, { borderBottomColor: colors.border }]}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                <Feather name="calendar" size={15} color={colors.primary} />
                <Text style={[styles.label, { color: colors.mutedForeground, marginBottom: 0 }]}>Buổi học</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: selectedSession ? colors.foreground : colors.mutedForeground }} numberOfLines={1}>
                  {selectedSession ? `Buổi ${selectedSession.sessionIndex} · ${formatSessionDate(selectedSession.sessionDate)}` : "Không gắn buổi"}
                </Text>
                <Feather name="chevron-right" size={15} color={colors.mutedForeground} />
              </View>
            </TouchableOpacity>

            {/* Published toggle */}
            <View style={[styles.pickerRow, { borderBottomWidth: 0 }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                <Feather name="send" size={15} color={colors.primary} />
                <Text style={[styles.label, { color: colors.mutedForeground, marginBottom: 0 }]}>Công bố cho học viên</Text>
              </View>
              <Switch
                value={published}
                onValueChange={(v) => { setPublished(v); Haptics.selectionAsync(); }}
                trackColor={{ false: colors.border, true: colors.primary + "88" }}
                thumbColor={published ? colors.primary : colors.mutedForeground}
              />
            </View>
          </View>

          {/* Score entry section - table layout */}
          {categories.length > 0 ? (
            <>
              <View style={[styles.formCard, { backgroundColor: colors.card, borderColor: colors.border, gap: 0, overflow: "hidden", padding: 0 }]}>
                <Text style={[styles.sectionTitle, { color: colors.foreground, borderBottomColor: colors.border }]}>
                  Nhập điểm ({students.length} học viên)
                </Text>

                {students.length === 0 ? (
                  <View style={{ padding: 24, alignItems: "center", gap: 8 }}>
                    <Feather name="users" size={24} color={colors.mutedForeground} />
                    <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>Chưa có học viên trong lớp</Text>
                  </View>
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={true} bounces={false}>
                    <View>
                      {/* Header row */}
                      <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.muted }}>
                        <View style={{ width: 150, paddingHorizontal: 12, paddingVertical: 8, justifyContent: "center" }}>
                          <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground }}>Học viên</Text>
                        </View>
                        {categories.map((cat) => (
                          <View key={cat.id} style={{ width: 82, borderLeftWidth: 1, borderLeftColor: colors.border, paddingHorizontal: 4, paddingVertical: 8, alignItems: "center", justifyContent: "center" }}>
                            <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, textAlign: "center" }} numberOfLines={2}>
                              {isComputed(cat.formula) ? "⚡ " : ""}{cat.category?.name ?? ""}
                            </Text>
                          </View>
                        ))}
                        <View style={{ width: 50, borderLeftWidth: 1, borderLeftColor: colors.border, paddingHorizontal: 4, paddingVertical: 8, alignItems: "center", justifyContent: "center" }}>
                          <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, textAlign: "center" }}>NX</Text>
                        </View>
                      </View>

                      {/* Student rows */}
                      {students.map((student, idx) => (
                        <View key={student.id} style={{ flexDirection: "row", borderBottomWidth: idx < students.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
                          <View style={{ width: 150, paddingHorizontal: 12, paddingVertical: 10, justifyContent: "center" }}>
                            <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground }} numberOfLines={1}>{student.fullName}</Text>
                            {student.code ? <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>{student.code}</Text> : null}
                          </View>
                          {categories.map((cat) => {
                            const computed = isComputed(cat.formula);
                            const displayVal = computed ? getComputedValue(cat, student.id) : (scores[student.id]?.[cat.categoryId] ?? "");
                            return (
                              <View key={cat.id} style={{ width: 82, borderLeftWidth: 1, borderLeftColor: colors.border, alignItems: "center", justifyContent: "center", paddingVertical: 8, paddingHorizontal: 4 }}>
                                {computed ? (
                                  <View style={{ alignItems: "center", gap: 2 }}>
                                    <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: displayVal ? colors.foreground : colors.mutedForeground }}>
                                      {displayVal || "—"}
                                    </Text>
                                  </View>
                                ) : (
                                  <TextInput
                                    value={scores[student.id]?.[cat.categoryId] ?? ""}
                                    onChangeText={(v) => setScore(student.id, cat.categoryId, v)}
                                    placeholder="—"
                                    placeholderTextColor={colors.mutedForeground}
                                    keyboardType="decimal-pad"
                                    style={{
                                      fontSize: 14,
                                      fontFamily: "Inter_500Medium",
                                      color: colors.foreground,
                                      textAlign: "center",
                                      width: 66,
                                      paddingHorizontal: 6,
                                      paddingVertical: 6,
                                      borderWidth: 1,
                                      borderColor: colors.border,
                                      borderRadius: 6,
                                      backgroundColor: colors.background,
                                    }}
                                  />
                                )}
                              </View>
                            );
                          })}
                          {/* Comment button column */}
                          <View style={{ width: 50, borderLeftWidth: 1, borderLeftColor: colors.border, alignItems: "center", justifyContent: "center", paddingVertical: 8, paddingHorizontal: 4 }}>
                            <TouchableOpacity
                              onPress={() => {
                                setCommentModalStudentId(student.id);
                              }}
                              style={{
                                width: 30,
                                height: 30,
                                borderRadius: 15,
                                alignItems: "center",
                                justifyContent: "center",
                                backgroundColor: comments[student.id] ? colors.primary + "20" : colors.muted,
                                borderWidth: 1,
                                borderColor: comments[student.id] ? colors.primary : colors.border,
                              }}
                            >
                              <Feather
                                name={comments[student.id] ? "eye" : "plus"}
                                size={14}
                                color={comments[student.id] ? colors.primary : colors.mutedForeground}
                              />
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                )}
              </View>

            </>
          ) : (
            <View style={[styles.formCard, { backgroundColor: colors.card, borderColor: colors.border, alignItems: "center", padding: 24, gap: 8 }]}>
              <Feather name="file-text" size={28} color={colors.mutedForeground} />
              <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center" }}>
                Chọn mẫu điểm ở trên để bắt đầu nhập điểm.
              </Text>
            </View>
          )}

          <View style={{ height: insets.bottom + 24 }} />
        </View>
      </ScrollView>

      {/* Pickers */}
      <PickerModal
        visible={sheetPickerVisible}
        title="Chọn mẫu điểm"
        items={sheets}
        selectedId={selectedSheetId}
        onSelect={(s: ScoreSheet) => { setSelectedSheetId(s.id); }}
        onClose={() => setSheetPickerVisible(false)}
        renderLabel={(s: ScoreSheet) => s.name}
        getItemId={(s: ScoreSheet) => s.id}
        colors={colors}
      />
      <PickerModal
        visible={sessionPickerVisible}
        title="Chọn buổi học"
        items={[{ id: "__none__", sessionIndex: null, sessionDate: null, weekday: null, startTime: "", endTime: "" }, ...sessions] as any[]}
        selectedId={selectedSessionId ?? "__none__"}
        onSelect={(s: any) => setSelectedSessionId(s.id === "__none__" ? null : s.id)}
        onClose={() => setSessionPickerVisible(false)}
        renderLabel={(s: any) => s.id === "__none__" ? "Không gắn buổi học" : `Buổi ${s.sessionIndex} · ${formatSessionDate(s.sessionDate ?? "")} (${s.startTime}–${s.endTime})`}
        getItemId={(s: any) => s.id}
        colors={colors}
      />

      {/* Comment modal — full screen rich text editor */}
      <Modal
        visible={commentModalStudentId !== null}
        animationType="slide"
        onRequestClose={() => setCommentModalStudentId(null)}
      >
        {commentModalStudentId !== null && (
          <CommentRichEditor
            student={students.find((st) => st.id === commentModalStudentId)}
            initialHtml={comments[commentModalStudentId] ?? ""}
            onSave={(html) => {
              const id = commentModalStudentId;
              setComments((prev) => html.trim() ? { ...prev, [id]: html } : prev);
            }}
            onDelete={() => {
              const id = commentModalStudentId;
              setComments((prev) => { const u = { ...prev }; delete u[id]; return u; });
            }}
            onClose={() => setCommentModalStudentId(null)}
          />
        )}
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  formCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  label: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    padding: 14,
    borderBottomWidth: 1,
  },
  input: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  scoreInput: {
    width: 70,
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    textAlign: "center",
  },
  computedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 70,
    justifyContent: "center",
  },
  commentInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 40,
    maxHeight: 80,
  },
});
