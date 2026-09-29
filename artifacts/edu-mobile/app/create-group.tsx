import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "@/hooks/useSafeAreaInsets";

import { useColors } from "@/hooks/useColors";
import { apiGet, apiPost } from "@/lib/api";

interface UserResult { userId: string; displayName: string; role: string; tinodeLogin: string; tinodeUid: string; }
interface ClassResult { id: string; name: string; classCode: string; }
interface ClassMember { userId: string; displayName: string; role: string; }

function roleLabel(role: string): string {
  if (role === "staff") return "Nhân viên";
  if (role === "teacher") return "Giáo viên";
  if (role === "admin") return "Admin";
  return "Học viên";
}

export default function CreateGroupScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [groupName, setGroupName] = useState("");
  const [memberQ, setMemberQ] = useState("");
  const [memberResults, setMemberResults] = useState<UserResult[]>([]);
  const [memberSearching, setMemberSearching] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<UserResult[]>([]);

  const [classQ, setClassQ] = useState("");
  const [classResults, setClassResults] = useState<ClassResult[]>([]);
  const [classSearching, setClassSearching] = useState(false);
  const [selectedClass, setSelectedClass] = useState<ClassResult | null>(null);
  const [classMembers, setClassMembers] = useState<ClassMember[]>([]);
  const [loadingClassMembers, setLoadingClassMembers] = useState(false);
  const [existingClassGroups, setExistingClassGroups] = useState<{ id: string; name: string }[]>([]);

  const [creating, setCreating] = useState(false);

  const memberTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const classTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchMembers = useCallback(async (q: string) => {
    if (!q.trim()) { setMemberResults([]); return; }
    setMemberSearching(true);
    try {
      const r = await apiGet<{ success: boolean; data: { users: UserResult[] } }>(
        `/api/mobile/chat/search-users?q=${encodeURIComponent(q)}`
      );
      setMemberResults(r.data?.users ?? []);
    } catch { setMemberResults([]); }
    finally { setMemberSearching(false); }
  }, []);

  const searchClasses = useCallback(async (q: string) => {
    setClassSearching(true);
    try {
      const r = await apiGet<{ success: boolean; data: { classes: ClassResult[] } }>(
        `/api/mobile/chat/classes/search?q=${encodeURIComponent(q)}`
      );
      setClassResults(r.data?.classes ?? []);
    } catch { setClassResults([]); }
    finally { setClassSearching(false); }
  }, []);

  const fetchClassMembers = useCallback(async (classId: string) => {
    setLoadingClassMembers(true);
    setClassMembers([]);
    try {
      const r = await apiGet<{ success: boolean; data: { members: ClassMember[] } }>(
        `/api/mobile/chat/classes/${classId}/members`
      );
      setClassMembers(r.data?.members ?? []);
    } catch { setClassMembers([]); }
    finally { setLoadingClassMembers(false); }
  }, []);

  const fetchClassGroups = useCallback(async (classId: string) => {
    setExistingClassGroups([]);
    try {
      const r = await apiGet<{ success: boolean; data: { groups: { id: string; name: string }[] } }>(
        `/api/mobile/chat/classes/${classId}/groups`
      );
      setExistingClassGroups(r.data?.groups ?? []);
    } catch { setExistingClassGroups([]); }
  }, []);

  const handleCreate = useCallback(async () => {
    if (!groupName.trim() || creating) return;
    setCreating(true);
    try {
      const body: Record<string, unknown> = { name: groupName.trim() };
      if (selectedClass) {
        body.classId = selectedClass.id;
        body.memberUserIds = [];
      } else {
        body.memberUserIds = selectedMembers.map(m => m.userId);
      }
      await apiPost("/api/mobile/chat/groups", body);
      router.back();
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 403) {
        Alert.alert("Không có quyền", "Bạn không được phép tạo nhóm chat.");
      } else {
        Alert.alert("Lỗi", "Không thể tạo nhóm. Vui lòng thử lại.");
      }
    } finally {
      setCreating(false);
    }
  }, [groupName, selectedMembers, selectedClass, creating]);

  const toggleMember = useCallback((u: UserResult) => {
    setSelectedMembers(prev =>
      prev.some(m => m.userId === u.userId)
        ? prev.filter(m => m.userId !== u.userId)
        : [...prev, u]
    );
  }, []);

  const canCreate = groupName.trim().length > 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Tạo nhóm mới</Text>
        <TouchableOpacity
          onPress={handleCreate}
          disabled={!canCreate || creating}
          style={[styles.createBtn, { backgroundColor: canCreate ? colors.primary : colors.muted }]}
        >
          {creating
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={[styles.createBtnText, { color: canCreate ? "#fff" : colors.mutedForeground }]}>Tạo</Text>}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        >
          {/* Tên nhóm */}
          <View style={[styles.section, { borderBottomColor: colors.border }]}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>TÊN NHÓM <Text style={{ color: "#ef4444" }}>*</Text></Text>
            <TextInput
              style={[styles.nameInput, { color: colors.foreground, borderBottomColor: colors.border }]}
              placeholder="Nhập tên nhóm..."
              placeholderTextColor={colors.mutedForeground}
              value={groupName}
              onChangeText={setGroupName}
              maxLength={80}
              returnKeyType="done"
            />
            <Text style={[styles.charCount, { color: colors.mutedForeground }]}>{groupName.length}/80</Text>
          </View>

          {/* Từ lớp học */}
          <View style={[styles.section, { borderBottomColor: colors.border }]}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>TỪ LỚP HỌC <Text style={[styles.optional, { color: colors.mutedForeground }]}>(tuỳ chọn)</Text></Text>

            {selectedClass ? (
              <View style={[styles.selectedClass, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "40" }]}>
                <Feather name="book-open" size={16} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.selectedClassName, { color: colors.foreground }]}>{selectedClass.name}</Text>
                  {selectedClass.classCode ? <Text style={[styles.selectedClassCode, { color: colors.mutedForeground }]}>{selectedClass.classCode}</Text> : null}
                </View>
                <TouchableOpacity
                  onPress={() => { setSelectedClass(null); setClassMembers([]); setExistingClassGroups([]); setClassQ(""); setClassResults([]); }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Feather name="x-circle" size={18} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={[styles.searchBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                  <Feather name="search" size={15} color={colors.mutedForeground} />
                  <TextInput
                    style={[styles.searchInput, { color: colors.foreground }]}
                    placeholder="Tìm tên lớp học..."
                    placeholderTextColor={colors.mutedForeground}
                    value={classQ}
                    onChangeText={q => {
                      setClassQ(q);
                      if (classTimer.current) clearTimeout(classTimer.current);
                      if (q.trim()) classTimer.current = setTimeout(() => searchClasses(q), 350);
                      else setClassResults([]);
                    }}
                  />
                  {classSearching
                    ? <ActivityIndicator size="small" color={colors.primary} />
                    : classQ.length > 0
                      ? <TouchableOpacity onPress={() => { setClassQ(""); setClassResults([]); }}><Feather name="x" size={14} color={colors.mutedForeground} /></TouchableOpacity>
                      : null}
                </View>

                {/* Class results inline */}
                {classQ.trim().length > 0 && classResults.length > 0 && classResults.map(c => (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.resultRow, { borderBottomColor: colors.border, backgroundColor: colors.background }]}
                    onPress={() => {
                      setSelectedClass(c);
                      setClassQ("");
                      setClassResults([]);
                      if (!groupName.trim()) setGroupName(c.name);
                      fetchClassMembers(c.id);
                      fetchClassGroups(c.id);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
                      <Feather name="book-open" size={14} color="#fff" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.resultName, { color: colors.foreground }]}>{c.name}</Text>
                      {c.classCode ? <Text style={[styles.resultSub, { color: colors.mutedForeground }]}>{c.classCode}</Text> : null}
                    </View>
                    <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                  </TouchableOpacity>
                ))}
                {!classSearching && classQ.trim().length > 0 && classResults.length === 0 && (
                  <Text style={[styles.noResult, { color: colors.mutedForeground }]}>Không tìm thấy lớp nào</Text>
                )}
              </>
            )}

            {/* Class info after selection */}
            {selectedClass && (
              <>
                {existingClassGroups.length > 0 && (
                  <View style={[styles.warning, { backgroundColor: "#fef3c7", borderColor: "#fcd34d" }]}>
                    <Feather name="alert-triangle" size={14} color="#d97706" />
                    <Text style={styles.warningText}>{`Lớp đã có nhóm: ${existingClassGroups.map(g => g.name).join(", ")}. Vẫn muốn tạo thêm?`}</Text>
                  </View>
                )}
                {loadingClassMembers ? (
                  <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 12 }} />
                ) : classMembers.length > 0 ? (
                  <View style={{ marginTop: 10 }}>
                    <Text style={[styles.memberCount, { color: colors.mutedForeground }]}>
                      {classMembers.length} thành viên sẽ được thêm tự động
                    </Text>
                    <View style={styles.chipRow}>
                      {classMembers.slice(0, 12).map(m => (
                        <View key={m.userId} style={[styles.chip, { backgroundColor: m.role === "staff" ? "#f59e0b" : colors.primary }]}>
                          <Text style={styles.chipText}>{m.displayName}</Text>
                        </View>
                      ))}
                      {classMembers.length > 12 && (
                        <View style={[styles.chip, { backgroundColor: colors.muted }]}>
                          <Text style={[styles.chipText, { color: colors.mutedForeground }]}>+{classMembers.length - 12}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                ) : null}
              </>
            )}
          </View>

          {/* Thành viên — chỉ hiện khi không chọn lớp */}
          {!selectedClass && (
            <View style={[styles.section, { borderBottomColor: colors.border }]}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>THÀNH VIÊN</Text>

              {/* Selected chips */}
              {selectedMembers.length > 0 && (
                <View style={styles.chipRow}>
                  {selectedMembers.map(m => (
                    <TouchableOpacity
                      key={m.userId}
                      style={[styles.chip, { backgroundColor: colors.primary }]}
                      onPress={() => setSelectedMembers(prev => prev.filter(x => x.userId !== m.userId))}
                    >
                      <Text style={styles.chipText}>{m.displayName}</Text>
                      <Feather name="x" size={10} color="#fff" style={{ marginLeft: 4 }} />
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Search input */}
              <View style={[styles.searchBox, { backgroundColor: colors.muted, borderColor: colors.border, marginTop: selectedMembers.length > 0 ? 10 : 0 }]}>
                <Feather name="search" size={15} color={colors.mutedForeground} />
                <TextInput
                  style={[styles.searchInput, { color: colors.foreground }]}
                  placeholder="Tìm theo tên..."
                  placeholderTextColor={colors.mutedForeground}
                  value={memberQ}
                  onChangeText={q => {
                    setMemberQ(q);
                    if (memberTimer.current) clearTimeout(memberTimer.current);
                    if (q.trim()) memberTimer.current = setTimeout(() => searchMembers(q), 300);
                    else setMemberResults([]);
                  }}
                />
                {memberSearching
                  ? <ActivityIndicator size="small" color={colors.primary} />
                  : memberQ.length > 0
                    ? <TouchableOpacity onPress={() => { setMemberQ(""); setMemberResults([]); }}><Feather name="x" size={14} color={colors.mutedForeground} /></TouchableOpacity>
                    : null}
              </View>

              {/* Member results inline — no popup */}
              {memberQ.trim().length > 0 && !memberSearching && memberResults.length === 0 && (
                <Text style={[styles.noResult, { color: colors.mutedForeground }]}>Không tìm thấy người dùng</Text>
              )}
              {memberResults.map(u => {
                const sel = selectedMembers.some(m => m.userId === u.userId);
                return (
                  <TouchableOpacity
                    key={u.userId}
                    style={[styles.resultRow, { borderBottomColor: colors.border, backgroundColor: sel ? colors.primary + "10" : colors.background }]}
                    onPress={() => toggleMember(u)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.avatar, { backgroundColor: sel ? colors.primary : colors.muted }]}>
                      {sel
                        ? <Feather name="check" size={14} color="#fff" />
                        : <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_700Bold", fontSize: 14 }}>{u.displayName[0]?.toUpperCase()}</Text>}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.resultName, { color: colors.foreground }]}>{u.displayName}</Text>
                      <Text style={[styles.resultSub, { color: colors.mutedForeground }]}>{roleLabel(u.role)}</Text>
                    </View>
                    {sel && <Feather name="check-circle" size={18} color={colors.primary} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontFamily: "Inter_700Bold",
  },
  createBtn: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 60,
    alignItems: "center",
    justifyContent: "center",
  },
  createBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  section: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  label: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  optional: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    textTransform: "none",
  },
  nameInput: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    paddingVertical: 4,
    borderBottomWidth: 1,
  },
  charCount: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textAlign: "right",
    marginTop: 4,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    padding: 0,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  resultName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  resultSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  noResult: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 10,
    textAlign: "center",
  },
  selectedClass: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  selectedClassName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  selectedClassCode: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  warning: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 10,
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#92400e",
  },
  memberCount: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 6,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  chipText: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
});
