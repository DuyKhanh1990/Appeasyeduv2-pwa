import { Feather } from "@expo/vector-icons";
import { useFocusEffect, router } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "@/hooks/useSafeAreaInsets";

import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { apiGet } from "@/lib/api";

interface EnrolledClass {
  classId: string;
  classCode: string;
  className: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  totalSessions: number;
  attendedSessions: number;
  remainingSessions: number;
}

interface LinkedStudent {
  id: string;
  code: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  address: string | null;
  accountStatus: string;
  status: string;
  relationship: string | null;
  enrolledClasses: EnrolledClass[];
}

interface ParentProfile {
  id: string;
  code: string;
  fullName: string;
  type: string;
  phone: string | null;
  email: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  address: string | null;
  relationship: string | null;
  accountStatus: string;
  status: string;
}

interface ParentProfileResponse {
  parent: ParentProfile;
  linkedStudents: LinkedStudent[];
}

function StudentCard({ student, colors }: { student: LinkedStudent; colors: ReturnType<typeof useColors> }) {
  const [expanded, setExpanded] = useState(false);
  const attendanceRate = student.enrolledClasses.length > 0
    ? Math.round(
        student.enrolledClasses.reduce((sum, c) => sum + (c.totalSessions > 0 ? (c.attendedSessions / c.totalSessions) * 100 : 0), 0) /
        student.enrolledClasses.length
      )
    : null;

  return (
    <View style={[styles.studentCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
      <View style={styles.studentHeader}>
        <View style={[styles.studentAvatar, { backgroundColor: colors.primary + "20" }]}>
          <Text style={[styles.studentAvatarText, { color: colors.primary }]}>{(student.fullName || "?")[0].toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.studentName, { color: colors.foreground }]}>{student.fullName}</Text>
          <Text style={[styles.studentCode, { color: colors.mutedForeground }]}>{student.code}</Text>
          {student.relationship && (
            <View style={[styles.relBadge, { backgroundColor: colors.primary + "15" }]}>
              <Text style={[styles.relBadgeText, { color: colors.primary }]}>{student.relationship}</Text>
            </View>
          )}
        </View>
        {attendanceRate !== null && (
          <View style={[styles.attendanceBadge, { backgroundColor: attendanceRate >= 80 ? colors.success + "18" : colors.warning + "18" }]}>
            <Text style={[styles.attendanceValue, { color: attendanceRate >= 80 ? colors.success : colors.warning }]}>{attendanceRate}%</Text>
            <Text style={[styles.attendanceLabel, { color: attendanceRate >= 80 ? colors.success : colors.warning }]}>Chuyên cần</Text>
          </View>
        )}
      </View>

      {student.enrolledClasses.length > 0 && (
        <>
          <TouchableOpacity
            onPress={() => setExpanded((v) => !v)}
            style={[styles.expandBtn, { borderColor: colors.border, backgroundColor: expanded ? colors.primary + "0a" : "transparent" }]}
            activeOpacity={0.7}
          >
            <Feather name="book" size={13} color={colors.primary} />
            <Text style={[styles.expandBtnText, { color: colors.primary }]}>
              {student.enrolledClasses.length} lớp học
            </Text>
            <Feather name={expanded ? "chevron-up" : "chevron-down"} size={13} color={colors.primary} />
          </TouchableOpacity>

          {expanded && (
            <View style={[styles.classesList, { borderTopColor: colors.border }]}>
              {student.enrolledClasses.map((cls) => {
                const pct = cls.totalSessions > 0 ? Math.round((cls.attendedSessions / cls.totalSessions) * 100) : null;
                const pctColor = pct === null ? colors.mutedForeground : pct >= 80 ? colors.success : pct >= 50 ? colors.warning : "#ef4444";
                return (
                  <View key={cls.classId} style={[styles.classRow, { borderBottomColor: colors.border }]}>
                    <View style={[styles.classCodeBadge, { backgroundColor: colors.primary + "15" }]}>
                      <Text style={[styles.classCodeText, { color: colors.primary }]}>{cls.classCode}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.className, { color: colors.foreground }]}>{cls.className}</Text>
                      <View style={styles.sessionStats}>
                        <Text style={[styles.sessionStat, { color: colors.success }]}>✓ {cls.attendedSessions} buổi</Text>
                        <Text style={[styles.sessionStat, { color: colors.mutedForeground }]}>/ {cls.totalSessions} tổng</Text>
                        <Text style={[styles.sessionStat, { color: colors.warning }]}>· {cls.remainingSessions} còn lại</Text>
                      </View>
                    </View>
                    {pct !== null && (
                      <View style={[styles.classPctBadge, { backgroundColor: pctColor + "18" }]}>
                        <Text style={[styles.classPctText, { color: pctColor }]}>{pct}%</Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </>
      )}

      {student.enrolledClasses.length === 0 && (
        <View style={[styles.noClass, { borderColor: colors.border }]}>
          <Feather name="book-open" size={13} color={colors.mutedForeground} />
          <Text style={[styles.noClassText, { color: colors.mutedForeground }]}>Chưa đăng ký lớp nào</Text>
        </View>
      )}
    </View>
  );
}

export default function ParentProfileScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const topPad = insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : 0;

  const [data, setData] = useState<ParentProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await apiGet<ParentProfileResponse>("/api/mobile/parent/profile");
      setData(res);
    } catch (e: any) {
      setError(e?.message || "Không thể tải thông tin phụ huynh");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchProfile(); }, [fetchProfile]));

  const onRefresh = () => {
    setRefreshing(true);
    fetchProfile(true);
  };

  const avatarLetter = (user?.name || user?.username || "P")[0].toUpperCase();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={[styles.header, { paddingTop: topPad + 4, backgroundColor: colors.gradientStart }]}
      >
        <View style={styles.backRow}>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={styles.backBtn}>
            <Feather name="arrow-left" size={20} color="#1e1b4b" />
          </TouchableOpacity>
        </View>
        <View style={[styles.headerContent, { marginTop: 4 }]}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>{avatarLetter}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>{data?.parent.fullName || user?.name || user?.username || "Phụ huynh"}</Text>
            <Text style={styles.headerSub}>{data?.parent.code ? `Mã: ${data.parent.code}` : "Tài khoản phụ huynh"}</Text>
          </View>
        </View>
        {data && (
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{data.linkedStudents.length}</Text>
              <Text style={styles.summaryLabel}>Học viên</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>
                {data.linkedStudents.reduce((sum, s) => sum + s.enrolledClasses.length, 0)}
              </Text>
              <Text style={styles.summaryLabel}>Lớp học</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>
                {data.linkedStudents.reduce((sum, s) => sum + s.enrolledClasses.reduce((a, c) => a + c.attendedSessions, 0), 0)}
              </Text>
              <Text style={styles.summaryLabel}>Buổi đã học</Text>
            </View>
          </View>
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Đang tải thông tin...</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Feather name="alert-circle" size={40} color={colors.destructive} />
          <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
        </View>
      ) : !data ? null : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, gap: 0, paddingBottom: 100 + bottomPad }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} progressBackgroundColor={colors.card} />}
        >
          <Text style={[styles.linkedTitle, { color: colors.foreground }]}>
            Học viên liên kết{data.linkedStudents.length > 0 ? ` (${data.linkedStudents.length})` : ""}
          </Text>

          {data.linkedStudents.length === 0 ? (
            <View style={[styles.emptyBox, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
              <Feather name="users" size={36} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Chưa liên kết học viên nào</Text>
              <Text style={[styles.emptySubText, { color: colors.mutedForeground }]}>Liên hệ trung tâm để liên kết tài khoản con</Text>
            </View>
          ) : (
            data.linkedStudents.map((student) => (
              <StudentCard key={student.id} student={student} colors={colors} />
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 14,
  },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(30,27,75,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(30,27,75,0.12)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(30,27,75,0.2)",
  },
  avatarText: {
    color: "#1e1b4b",
    fontSize: 22,
    fontFamily: "Inter_700Bold",
  },
  headerTitle: {
    color: "#1e1b4b",
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  headerSub: {
    color: "rgba(30,27,75,0.65)",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  summaryRow: {
    flexDirection: "row",
    backgroundColor: "rgba(30,27,75,0.08)",
    borderRadius: 12,
    padding: 14,
  },
  summaryItem: { flex: 1, alignItems: "center", gap: 2 },
  summaryValue: { color: "#1e1b4b", fontSize: 20, fontFamily: "Inter_700Bold" },
  summaryLabel: { color: "rgba(30,27,75,0.65)", fontSize: 11, fontFamily: "Inter_400Regular" },
  divider: { width: 1, backgroundColor: "rgba(30,27,75,0.15)", marginVertical: 4 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  loadingText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  errorText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  linkedTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    marginBottom: 12,
  },
  studentCard: {
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
    gap: 10,
  },
  studentHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  studentAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  studentAvatarText: { fontSize: 18, fontFamily: "Inter_700Bold" },
  studentName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  studentCode: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  relBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 4,
  },
  relBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  attendanceBadge: {
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    minWidth: 52,
  },
  attendanceValue: { fontSize: 18, fontFamily: "Inter_700Bold" },
  attendanceLabel: { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 1 },
  expandBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 8,
  },
  expandBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  classesList: {
    borderTopWidth: 1,
    paddingTop: 10,
    gap: 0,
  },
  classRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  classCodeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  classCodeText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  className: { fontSize: 13, fontFamily: "Inter_500Medium" },
  sessionStats: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3, flexWrap: "wrap" },
  sessionStat: { fontSize: 12, fontFamily: "Inter_400Regular" },
  classPctBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    alignSelf: "center",
    minWidth: 44,
    alignItems: "center",
  },
  classPctText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  noClass: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: 8,
    borderStyle: "dashed",
  },
  noClassText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  emptyBox: {
    padding: 32,
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
  },
  emptyText: { fontSize: 15, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  emptySubText: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", opacity: 0.7 },
});
