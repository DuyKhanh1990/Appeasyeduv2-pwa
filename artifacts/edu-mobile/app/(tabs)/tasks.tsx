import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect } from "expo-router";
import { popTasksDeeplink } from "@/lib/deeplinkStore";
import * as DocumentPicker from "expo-document-picker";
import * as Linking from "expo-linking";
import { DocViewerModal, FileItem, FileViewer } from "@/components/FileViewer";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "@/hooks/useSafeAreaInsets";

import { HtmlText } from "@/components/HtmlText";
import { useColors } from "@/hooks/useColors";
import { apiDelete, apiGet, apiPatch, apiPost, getCenterUrl, getAuthToken } from "@/lib/api";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Status {
  id: string;
  name: string;
  color: string;
  position: number;
  isFixed: boolean;
}

interface Level {
  id: string;
  name: string;
  color: string;
  position: number;
}

interface Person {
  id: string;
  name?: string;
  username: string;
}

interface Attachment {
  name?: string;
  url: string;
  size?: number;
  mimetype?: string;
}

interface Task {
  id: string;
  title: string;
  description?: string;
  content?: string;
  status: Status;
  level?: Level;
  assignees?: (Person | DetailPerson)[];
  managers?: DetailPerson[];
  creator?: Person;
  manager?: Person;
  dueDate?: string;
  createdAt?: string;
  updatedAt?: string;
  attachments?: Attachment[];
}

interface DetailPerson {
  id: string;
  fullName: string;
  code?: string;
  phone?: string;
  email?: string;
}

interface Subject {
  id: string;
  name: string;
  fullName?: string;
  code?: string;
  type?: string;
  phone?: string;
}

interface LocationDetail {
  id: string;
  name: string;
  code?: string;
}

interface Department {
  id: string;
  name: string;
}

interface TaskDetailResponse {
  permissions: Permissions;
  task: Task;
  status: Status;
  level?: Level;
  managers: DetailPerson[];
  assignees: DetailPerson[];
  subjects: Subject[];
  locationDetails: LocationDetail[];
  department?: Department;
  creatorName?: string;
}

interface KanbanColumn {
  status: Status | null;
  tasks: Task[];
}

interface Permissions {
  canView: boolean;
  canViewAll: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

interface KanbanResponse {
  permissions: Permissions;
  statuses: Status[];
  levels: Level[];
  columns: KanbanColumn[];
}

interface Comment {
  id: string;
  taskId?: string;
  content: string;
  author?: Person;
  authorId?: string;
  authorName?: string;
  createdAt?: string;
}

interface UserItem {
  id: string;
  name?: string | null;
  username: string;
  role: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function isOverdue(dueDate?: string): boolean {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
}

function getInitials(person?: Person | UserItem | DetailPerson): string {
  if (!person) return "?";
  const name = (person as DetailPerson).fullName || (person as Person).name || (person as UserItem).username || "?";
  return name.split(" ").map((w: string) => w[0] || "").join("").toUpperCase().slice(0, 2) || "?";
}

function parseDateInput(s: string): string | null {
  const parts = s.trim().split("/");
  if (parts.length !== 3) return null;
  const [d, m, y] = parts.map(Number);
  if (!d || !m || !y || y < 2000 || y > 2100) return null;
  const date = new Date(y, m - 1, d);
  if (isNaN(date.getTime())) return null;
  return date.toISOString();
}

function dueDateToInput(iso?: string | null): string {
  if (!iso) return "";
  return formatDate(iso);
}

const AVATAR_COLORS = ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ef4444", "#06b6d4"];
function getAvatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function PersonAvatar({ person, size = 30, overlap = false, borderColor = "#fff" }: { person: Person | DetailPerson; size?: number; overlap?: boolean; borderColor?: string }) {
  const bg = getAvatarColor(person.id);
  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bg,
          marginLeft: overlap ? -8 : 0,
          borderColor,
          borderWidth: 1.5,
        },
      ]}
    >
      <Text style={[styles.avatarText, { fontSize: size * 0.35 }]}>{getInitials(person)}</Text>
    </View>
  );
}

// ─── Task Card ───────────────────────────────────────────────────────────────

function TaskCard({ task, colors, onPress, showStatus = false, statuses = [], users = [] }: { task: Task; colors: any; onPress: () => void; showStatus?: boolean; statuses?: Status[]; users?: UserItem[] }) {
  const resolvedStatus = statuses.find((s) => s.id === (task.status?.id || (task as any).statusId)) || task.status;
  const statusColor = resolvedStatus?.color || task.status?.color || "#6b7280";
  const statusName = resolvedStatus?.name || task.status?.name || "";
  const isCompleted = statusName === "Hoàn thành";
  const overdue = isOverdue(task.dueDate) && !isCompleted;
  const levelColor = task.level?.color || "#6b7280";

  const rawDescription: string | undefined = task.description || task.content;

  // New API: task.managers (DetailPerson[]) and task.assignees (DetailPerson[])
  // Old API fallback: task.manager (Person) and task.assignees (Person[]) resolved via users list
  const detailManagers: DetailPerson[] = task.managers || [];
  const resolvedManager: Person | DetailPerson | undefined =
    detailManagers[0] ||
    task.manager ||
    (() => {
      const mid = (task as any).managerId as string | undefined;
      return mid ? users.find(u => u.id === mid) : undefined;
    })();

  const detailAssignees: (Person | DetailPerson)[] = task.assignees?.length
    ? task.assignees
    : (() => {
        const ids: string[] = (task as any).assigneeIds || [];
        return ids.length ? (users.filter(u => ids.includes(u.id)) as unknown as (Person | DetailPerson)[]) : [];
      })();

  const hasPeople = resolvedManager || detailAssignees.length > 0;

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={[styles.cardAccent, { backgroundColor: statusColor }]} />
      <View style={styles.cardContent}>

        <View style={styles.cardTitleRow}>
          <Text style={[styles.cardTitle, { color: colors.foreground, flex: 1 }]} numberOfLines={2}>
            {task.title}
          </Text>
          {(showStatus && statusName) || task.level ? (
            <View style={styles.cardBadgeStack}>
              {showStatus && statusName ? (
                <View style={[styles.statusBadge, { backgroundColor: hexToRgba(statusColor, 0.12), borderColor: hexToRgba(statusColor, 0.25) }]}>
                  <View style={[styles.levelDot, { backgroundColor: statusColor }]} />
                  <Text style={[styles.levelText, { color: statusColor }]}>{statusName}</Text>
                </View>
              ) : null}
              {task.level ? (
                <View style={[styles.levelBadge, { backgroundColor: hexToRgba(levelColor, 0.12), borderColor: hexToRgba(levelColor, 0.3) }]}>
                  <View style={[styles.levelDot, { backgroundColor: levelColor }]} />
                  <Text style={[styles.levelText, { color: levelColor }]}>{task.level.name}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>

        {rawDescription ? (
          <Text style={[styles.cardDesc, { color: colors.mutedForeground }]} numberOfLines={2}>
            {rawDescription}
          </Text>
        ) : null}

        {task.dueDate ? (
          <>
            <View style={[styles.cardSep, { backgroundColor: colors.border }]} />
            <View style={styles.cardDateRow}>
              <View style={styles.cardDateLeft}>
                <Feather name="calendar" size={13} color={overdue ? "#ef4444" : colors.mutedForeground} />
                <Text style={[styles.cardDateText, { color: overdue ? "#ef4444" : colors.mutedForeground }]}>
                  {formatDate(task.dueDate)}
                </Text>
              </View>
              {overdue ? (
                <Text style={styles.cardOverdueText}>Quá hạn</Text>
              ) : null}
            </View>
          </>
        ) : null}

        {hasPeople ? (
          <>
            <View style={[styles.cardSep, { backgroundColor: colors.border }]} />
            {resolvedManager ? (
              <View style={styles.cardPersonRow}>
                <Text style={[styles.cardPersonLabel, { color: colors.mutedForeground }]}>Quản lý:</Text>
                <PersonAvatar person={resolvedManager as Person | DetailPerson} size={22} borderColor={colors.card} />
              </View>
            ) : null}
            {detailAssignees.length > 0 ? (
              <View style={styles.cardPersonRow}>
                <Text style={[styles.cardPersonLabel, { color: colors.mutedForeground }]}>Thực hiện:</Text>
                <View style={styles.avatarRow}>
                  {detailAssignees.slice(0, 4).map((a, i) => (
                    <PersonAvatar key={a.id} person={a as Person | DetailPerson} size={22} overlap={i > 0} borderColor={colors.card} />
                  ))}
                  {detailAssignees.length > 4 ? (
                    <View style={[styles.avatar, { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.muted, marginLeft: -8, borderColor: colors.card, borderWidth: 1.5 }]}>
                      <Text style={[styles.avatarText, { color: colors.mutedForeground, fontSize: 8 }]}>+{detailAssignees.length - 4}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            ) : null}
          </>
        ) : null}

      </View>
    </TouchableOpacity>
  );
}

// ─── Status Tab Bar ──────────────────────────────────────────────────────────

interface TabItem {
  id: string;
  name: string;
  color: string;
  count: number;
}

function StatusTabBar({
  tabs,
  activeTab,
  onSelect,
  colors,
}: {
  tabs: TabItem[];
  activeTab: string;
  onSelect: (id: string) => void;
  colors: any;
}) {
  return (
    <View style={[styles.tabBarWrapper, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabBarContent}
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const c = tab.color;
          return (
            <TouchableOpacity
              key={tab.id}
              onPress={() => onSelect(tab.id)}
              style={[styles.tabItem, isActive && { borderBottomColor: c, borderBottomWidth: 2.5 }]}
              activeOpacity={0.7}
            >
              <View style={styles.tabInner}>
                <Text
                  style={[
                    styles.tabLabel,
                    { color: isActive ? c : colors.mutedForeground },
                    isActive && styles.tabLabelActive,
                  ]}
                  numberOfLines={1}
                >
                  {tab.name}
                </Text>
                <View
                  style={[
                    styles.tabCount,
                    { backgroundColor: isActive ? hexToRgba(c, 0.15) : colors.muted },
                  ]}
                >
                  <Text style={[styles.tabCountText, { color: isActive ? c : colors.mutedForeground }]}>
                    {tab.count}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ─── Task Detail Modal ───────────────────────────────────────────────────────

function TaskDetailModal({
  task,
  visible,
  onClose,
  onDeleted,
  onEdited,
  permissions,
  statuses,
  levels,
  users = [],
  colors,
  insets,
}: {
  task: Task | null;
  visible: boolean;
  onClose: () => void;
  onDeleted: (id: string) => void;
  onEdited: (task: Task) => void;
  permissions: Permissions;
  statuses: Status[];
  levels: Level[];
  users: UserItem[];
  colors: any;
  insets: { bottom: number; top: number };
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [taskDetail, setTaskDetail] = useState<TaskDetailResponse | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editStatusId, setEditStatusId] = useState("");
  const [editLevelId, setEditLevelId] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editManagerId, setEditManagerId] = useState("");
  const [editAssigneeIds, setEditAssigneeIds] = useState<string[]>([]);
  const [showManagerPicker, setShowManagerPicker] = useState(false);
  const [showAssigneesPicker, setShowAssigneesPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showManagersPopup, setShowManagersPopup] = useState(false);
  const [showAssigneesPopup, setShowAssigneesPopup] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loadingAttachments, setLoadingAttachments] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [viewingFile, setViewingFile] = useState<FileItem | null>(null);

  React.useEffect(() => {
    if (visible && task) {
      setEditTitle(task.title);
      setEditDesc(task.description || "");
      setEditStatusId(task.status?.id || "");
      setEditLevelId(task.level?.id || "");
      setEditDueDate(dueDateToInput(task.dueDate));
      setEditManagerId(task.manager?.id || "");
      setEditAssigneeIds(task.assignees?.map((a) => a.id) || []);
      setEditMode(false);
      setTaskDetail(null);
      setAttachments(task.attachments || []);
      loadComments(task.id);
      loadTaskDetail(task.id);
      loadAttachments(task.id);
    }
  }, [visible, task]);

  const loadTaskDetail = async (id: string) => {
    setLoadingDetail(true);
    try {
      const data = await apiGet<TaskDetailResponse>(`/api/mobile/tasks/${id}`);
      setTaskDetail(data);
    } catch {
      setTaskDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  };

  const loadComments = async (id: string) => {
    setLoadingComments(true);
    try {
      const data = await apiGet<Comment[]>(`/api/mobile/tasks/${id}/comments`);
      setComments(data);
    } catch {
      setComments([]);
    } finally {
      setLoadingComments(false);
    }
  };

  const handleAddComment = async () => {
    if (!task || !newComment.trim()) return;
    setSubmitting(true);
    try {
      await apiPost(`/api/mobile/tasks/${task.id}/comments`, { content: newComment.trim() });
      setNewComment("");
      await loadComments(task.id);
    } catch {
      Alert.alert("Lỗi", "Không thể gửi bình luận");
    } finally {
      setSubmitting(false);
    }
  };

  const loadAttachments = async (id: string) => {
    setLoadingAttachments(true);
    try {
      const data = await apiGet<Attachment[]>(`/api/mobile/tasks/${id}/attachments`);
      setAttachments(data);
    } catch {
      // keep existing attachments from task
    } finally {
      setLoadingAttachments(false);
    }
  };

  const handleUploadAttachment = async () => {
    if (!task) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.length) return;
      setUploadingAttachment(true);
      const baseUrl = getCenterUrl();
      if (!baseUrl) throw new Error("Chưa có URL");
      const formData = new FormData();
      for (const asset of result.assets) {
        if (Platform.OS === "web") {
          if ((asset as any).file) {
            formData.append("files", (asset as any).file, asset.name);
          } else {
            const res = await fetch(asset.uri);
            const blob = await res.blob();
            formData.append("files", blob, asset.name);
          }
        } else {
          formData.append("files", {
            uri: asset.uri,
            name: asset.name,
            type: asset.mimeType || "application/octet-stream",
          } as unknown as Blob);
        }
      }
      const headers: Record<string, string> = { Accept: "application/json" };
      const token = getAuthToken();
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const response = await fetch(`${baseUrl}/api/mobile/tasks/${task.id}/attachments`, {
        method: "POST",
        headers,
        body: formData,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json() as { attachments: Attachment[] };
      setAttachments(data.attachments);
    } catch {
      Alert.alert("Lỗi", "Không thể tải lên file");
    } finally {
      setUploadingAttachment(false);
    }
  };

  const handleDeleteAttachment = (att: Attachment) => {
    Alert.alert("Xoá file", `Bạn có chắc muốn xoá "${att.name || att.url}"?`, [
      { text: "Huỷ", style: "cancel" },
      {
        text: "Xoá",
        style: "destructive",
        onPress: async () => {
          if (!task) return;
          try {
            const baseUrl = getCenterUrl();
            if (!baseUrl) throw new Error("Chưa có URL");
            const delHeaders: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
            const token = getAuthToken();
            if (token) delHeaders["Authorization"] = `Bearer ${token}`;
            const response = await fetch(`${baseUrl}/api/mobile/tasks/${task.id}/attachments`, {
              method: "DELETE",
              headers: delHeaders,
              body: JSON.stringify({ url: att.url }),
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json() as { attachments: Attachment[] };
            setAttachments(data.attachments);
          } catch {
            Alert.alert("Lỗi", "Không thể xoá file");
          }
        },
      },
    ]);
  };


  const handleDelete = () => {
    if (!task) return;
    Alert.alert("Xóa công việc", `Bạn có chắc muốn xóa "${task.title}"?`, [
      { text: "Hủy", style: "cancel" },
      {
        text: "Xóa",
        style: "destructive",
        onPress: async () => {
          setDeleting(true);
          try {
            await apiDelete(`/api/mobile/tasks/${task.id}`);
            onDeleted(task.id);
            onClose();
          } catch {
            Alert.alert("Lỗi", "Không thể xóa công việc");
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  };

  const handleSaveEdit = async () => {
    if (!task || !editTitle.trim()) return;
    const dueDateISO = editDueDate.trim() ? parseDateInput(editDueDate.trim()) : null;
    if (editDueDate.trim() && !dueDateISO) {
      Alert.alert("Ngày không hợp lệ", "Vui lòng nhập định dạng DD/MM/YYYY");
      return;
    }
    setSaving(true);
    try {
      const updated = await apiPatch<Task>(`/api/mobile/tasks/${task.id}`, {
        title: editTitle.trim(),
        content: editDesc.trim() || undefined,
        statusId: editStatusId,
        levelId: editLevelId || undefined,
        managerIds: editManagerId ? [editManagerId] : [],
        assigneeIds: editAssigneeIds,
        dueDate: dueDateISO || null,
      });
      onEdited(updated);
      setEditMode(false);
    } catch {
      Alert.alert("Lỗi", "Không thể lưu thay đổi");
    } finally {
      setSaving(false);
    }
  };

  const editManagerUser = users.find((u) => u.id === editManagerId);
  const editAssigneeUsers = users.filter((u) => editAssigneeIds.includes(u.id));

  if (!task) return null;
  const resolvedStatus = statuses.find((s) => s.id === (task.status?.id || (task as any).statusId)) || task.status;
  const statusColor = resolvedStatus?.color || task.status?.color || "#6b7280";
  const statusName = resolvedStatus?.name || task.status?.name || "";

  const managersToShow = taskDetail?.managers ?? [];
  const assigneesToShow = taskDetail?.assignees ?? [];
  const descriptionText = taskDetail?.task?.description || (taskDetail as any)?.description || task.description;
  const subjectsToShow: Subject[] = taskDetail?.subjects ?? (taskDetail as any)?.task?.subjects ?? [];

  // Task-level permissions (ownership + role combined) take priority for edit/delete.
  // Fall back to role-level prop while taskDetail is still loading.
  const effectivePermissions: Permissions = {
    canView: taskDetail?.permissions?.canView ?? permissions.canView,
    canViewAll: taskDetail?.permissions?.canViewAll ?? permissions.canViewAll,
    canCreate: permissions.canCreate,
    canEdit: taskDetail?.permissions?.canEdit ?? permissions.canEdit,
    canDelete: taskDetail?.permissions?.canDelete ?? permissions.canDelete,
  };

  const renderCompactPersons = (people: DetailPerson[], onShowAll: () => void) => {
    const visible = people.slice(0, 3);
    const extra = people.length - 3;
    return (
      <View style={{ flex: 1, gap: 5 }}>
        {visible.map((p) => (
          <View key={p.id} style={styles.compactPersonRow}>
            <View style={[styles.compactAvatar, { backgroundColor: getAvatarColor(p.id) }]}>
              <Text style={styles.compactAvatarText}>
                {(p.fullName || "?").split(" ").map((w: string) => w[0] || "").join("").toUpperCase().slice(0, 2)}
              </Text>
            </View>
            <Text style={[styles.compactPersonName, { color: colors.foreground }]}>
              {p.fullName}{p.code ? ` (${p.code})` : ""}
            </Text>
          </View>
        ))}
        {extra > 0 && (
          <TouchableOpacity onPress={onShowAll} style={[styles.showMoreBtn, { backgroundColor: colors.muted }]}>
            <Text style={[styles.showMoreText, { color: colors.primary }]}>+{extra} người khác</Text>
            <Feather name="chevron-down" size={12} color={colors.primary} />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <>
    <Modal visible={visible} transparent={false} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.detailFull, { backgroundColor: colors.background }]}>

        <View style={[styles.detailFullNav, { backgroundColor: colors.card, borderBottomColor: colors.border, paddingTop: insets.top }]}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          {editMode && (
            <View style={styles.detailNavActions}>
              <TouchableOpacity style={[styles.iconBtn, { backgroundColor: colors.muted }]} onPress={() => setEditMode(false)}>
                <Feather name="x" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.iconBtn, { backgroundColor: colors.primary }]} onPress={handleSaveEdit} disabled={saving}>
                {saving ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="check" size={16} color="#fff" />}
              </TouchableOpacity>
            </View>
          )}
        </View>

        <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} keyboardShouldPersistTaps="handled">

          <View style={[styles.detailTitleSection, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            {editMode ? (
              <TextInput
                style={[styles.editTitleInput, { color: colors.foreground, borderColor: colors.primary }]}
                value={editTitle}
                onChangeText={setEditTitle}
                multiline
                placeholder="Tiêu đề công việc"
                placeholderTextColor={colors.mutedForeground}
              />
            ) : (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={[styles.detailTitle, { flex: 1, color: colors.foreground }]}>{task.title}</Text>
                {statusName ? (
                  <View style={{ backgroundColor: hexToRgba(statusColor, 0.15), paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                    <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: statusColor }}>{statusName}</Text>
                  </View>
                ) : null}
                {effectivePermissions.canEdit && (
                  <TouchableOpacity style={[styles.iconBtn, { backgroundColor: colors.muted }]} onPress={() => setEditMode(true)}>
                    <Feather name="edit-2" size={15} color={colors.mutedForeground} />
                  </TouchableOpacity>
                )}
                {effectivePermissions.canDelete && (
                  <TouchableOpacity style={[styles.iconBtn, { backgroundColor: "#fee2e2" }]} onPress={handleDelete} disabled={deleting}>
                    {deleting ? <ActivityIndicator size="small" color="#ef4444" /> : <Feather name="trash-2" size={15} color="#ef4444" />}
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>

          {editMode && (
            <View style={[styles.editSection, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
              <Text style={[styles.editLabel, { color: colors.mutedForeground }]}>Nội dung công việc</Text>
              <TextInput
                style={[styles.editDescInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                value={editDesc}
                onChangeText={setEditDesc}
                multiline
                placeholder="Mô tả công việc..."
                placeholderTextColor={colors.mutedForeground}
              />

              <Text style={[styles.editLabel, { color: colors.mutedForeground, marginTop: 12 }]}>Trạng thái</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                {statuses.map((s) => (
                  <TouchableOpacity
                    key={s.id}
                    onPress={() => setEditStatusId(s.id)}
                    style={[styles.selectChip, { borderColor: s.color || "#6b7280", backgroundColor: editStatusId === s.id ? hexToRgba(s.color || "#6b7280", 0.15) : "transparent" }]}
                  >
                    <Text style={[styles.selectChipText, { color: s.color || "#6b7280" }]}>{s.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={[styles.editLabel, { color: colors.mutedForeground, marginTop: 12 }]}>Mức độ</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                {levels.map((l) => (
                  <TouchableOpacity
                    key={l.id}
                    onPress={() => setEditLevelId(editLevelId === l.id ? "" : l.id)}
                    style={[styles.selectChip, { borderColor: l.color || "#6b7280", backgroundColor: editLevelId === l.id ? hexToRgba(l.color || "#6b7280", 0.15) : "transparent" }]}
                  >
                    <Text style={[styles.selectChipText, { color: l.color || "#6b7280" }]}>{l.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={[styles.editLabel, { color: colors.mutedForeground, marginTop: 12 }]}>Hạn hoàn thành</Text>
              <View style={[styles.dateInputRow, { borderColor: colors.border, backgroundColor: colors.background, marginTop: 6 }]}>
                <Feather name="calendar" size={14} color={colors.mutedForeground} />
                <TextInput
                  style={[styles.dateInputField, { color: colors.foreground }]}
                  value={editDueDate}
                  onChangeText={setEditDueDate}
                  placeholder="DD/MM/YYYY"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="numeric"
                />
              </View>

              <Text style={[styles.editLabel, { color: colors.mutedForeground, marginTop: 12 }]}>Quản lý</Text>
              <TouchableOpacity
                style={[styles.pickerBtn, { borderColor: colors.border, backgroundColor: colors.background, marginTop: 6 }]}
                onPress={() => setShowManagerPicker(true)}
              >
                {editManagerUser ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <PersonAvatar person={{ id: editManagerUser.id, name: editManagerUser.name ?? undefined, username: editManagerUser.username }} size={24} />
                    <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: "Inter_400Regular" }}>{editManagerUser.name || editManagerUser.username}</Text>
                  </View>
                ) : (
                  <Text style={{ color: colors.mutedForeground, fontSize: 13, fontFamily: "Inter_400Regular" }}>Chọn quản lý...</Text>
                )}
                <Feather name="chevron-down" size={14} color={colors.mutedForeground} />
              </TouchableOpacity>

              <Text style={[styles.editLabel, { color: colors.mutedForeground, marginTop: 12 }]}>Thực hiện</Text>
              <TouchableOpacity
                style={[styles.pickerBtn, { borderColor: colors.border, backgroundColor: colors.background, marginTop: 6 }]}
                onPress={() => setShowAssigneesPicker(true)}
              >
                {editAssigneeUsers.length > 0 ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    {editAssigneeUsers.slice(0, 4).map((a, i) => (
                      <PersonAvatar key={a.id} person={{ id: a.id, name: a.name ?? undefined, username: a.username }} size={24} overlap={i > 0} />
                    ))}
                    <Text style={{ color: colors.foreground, fontSize: 12, fontFamily: "Inter_400Regular", marginLeft: 4 }}>{editAssigneeUsers.length} người</Text>
                  </View>
                ) : (
                  <Text style={{ color: colors.mutedForeground, fontSize: 13, fontFamily: "Inter_400Regular" }}>Chọn người thực hiện...</Text>
                )}
                <Feather name="chevron-down" size={14} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
          )}

          {loadingDetail && !taskDetail && (
            <View style={{ paddingVertical: 16, alignItems: "center" }}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          )}

          <View style={[styles.detailMeta, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
            {task.level && (
              <View style={styles.metaRow}>
                <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>Mức độ</Text>
                <View style={[styles.levelBadge, { backgroundColor: hexToRgba(task.level.color, 0.12), borderColor: hexToRgba(task.level.color, 0.3) }]}>
                  <View style={[styles.levelDot, { backgroundColor: task.level.color }]} />
                  <Text style={[styles.levelText, { color: task.level.color }]}>{task.level.name}</Text>
                </View>
              </View>
            )}

            {task.dueDate && (
              <View style={styles.metaRow}>
                <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>Hạn</Text>
                <Text style={[styles.metaValue, { color: isOverdue(task.dueDate) ? "#ef4444" : colors.foreground }]}>
                  {formatDate(task.dueDate)}{isOverdue(task.dueDate) ? "  ⚠ Quá hạn" : ""}
                </Text>
              </View>
            )}

            {(taskDetail?.creatorName || task.creator) && (
              <View style={styles.metaRow}>
                <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>Người tạo</Text>
                <Text style={[styles.metaValue, { color: colors.foreground }]}>
                  {taskDetail?.creatorName || task.creator?.name || task.creator?.username}
                </Text>
              </View>
            )}

            {taskDetail?.department && (
              <View style={styles.metaRow}>
                <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>Phòng ban</Text>
                <Text style={[styles.metaValue, { color: colors.foreground }]}>{taskDetail.department.name}</Text>
              </View>
            )}

            {managersToShow.length > 0 ? (
              <View style={[styles.metaRow, { alignItems: "flex-start" }]}>
                <Text style={[styles.metaLabel, { color: colors.mutedForeground, paddingTop: 3 }]}>Quản lý</Text>
                {renderCompactPersons(managersToShow, () => setShowManagersPopup(true))}
              </View>
            ) : task.manager ? (
              <View style={styles.metaRow}>
                <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>Quản lý</Text>
                <Text style={[styles.metaValue, { color: colors.foreground }]}>{task.manager.name || task.manager.username}</Text>
              </View>
            ) : null}

            {assigneesToShow.length > 0 ? (
              <View style={[styles.metaRow, { alignItems: "flex-start" }]}>
                <Text style={[styles.metaLabel, { color: colors.mutedForeground, paddingTop: 3 }]}>Thực hiện</Text>
                {renderCompactPersons(assigneesToShow, () => setShowAssigneesPopup(true))}
              </View>
            ) : task.assignees && task.assignees.length > 0 ? (
              <View style={styles.metaRow}>
                <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>Thực hiện</Text>
                <Text style={[styles.metaValue, { color: colors.foreground }]}>{task.assignees.map((a) => ('fullName' in a ? a.fullName : (a.name || a.username))).join(", ")}</Text>
              </View>
            ) : null}

            {subjectsToShow.length > 0 && (
              <View style={[styles.metaRow, { alignItems: "flex-start" }]}>
                <Text style={[styles.metaLabel, { color: colors.mutedForeground, paddingTop: 3 }]}>Đối tượng</Text>
                <View style={{ flex: 1, gap: 4 }}>
                  {subjectsToShow.map((s) => (
                    <View key={s.id} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <View style={[styles.compactAvatar, { backgroundColor: getAvatarColor(s.id) }]}>
                        <Text style={styles.compactAvatarText}>
                          {(s.fullName || s.name || "?").split(" ").map((w: string) => w[0] || "").join("").toUpperCase().slice(0, 2)}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.compactPersonName, { color: colors.foreground }]}>
                          {s.fullName || s.name}{s.code ? ` (${s.code})` : ""}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {taskDetail?.locationDetails && taskDetail.locationDetails.length > 0 && (
              <View style={styles.metaRow}>
                <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>Cơ sở</Text>
                <View style={{ flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
                  {taskDetail.locationDetails.map((l) => (
                    <View key={l.id} style={[styles.tagChip, { backgroundColor: colors.muted }]}>
                      <Text style={[styles.tagChipText, { color: colors.foreground }]}>{l.name}{l.code ? ` (${l.code})` : ""}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>

          {descriptionText && !editMode && (
            <View style={[styles.descSection, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Nội dung công việc</Text>
              <Text style={[styles.descText, { color: colors.mutedForeground }]}>{descriptionText}</Text>
            </View>
          )}

          <View style={[styles.descSection, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
            <View style={styles.attachmentHeader}>
              <Text style={[styles.sectionTitle, { color: colors.foreground, marginBottom: 0 }]}>File đính kèm</Text>
              {effectivePermissions.canEdit && (
                <TouchableOpacity
                  style={[styles.attachmentUploadBtn, { backgroundColor: colors.primary }]}
                  onPress={handleUploadAttachment}
                  disabled={uploadingAttachment}
                >
                  {uploadingAttachment ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Feather name="upload" size={12} color="#fff" />
                      <Text style={styles.attachmentUploadText}>Tải lên</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
            {loadingAttachments ? (
              <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 8 }} />
            ) : attachments.length === 0 ? (
              <Text style={[styles.noComments, { color: colors.mutedForeground, marginTop: 8 }]}>Chưa có file đính kèm</Text>
            ) : (
              attachments.map((att, i) => (
                <View key={att.url + i} style={{ position: "relative" }}>
                  <FileViewer
                    file={{ name: att.name || att.url, url: att.url, mimetype: att.mimetype, size: att.size }}
                  />
                  {effectivePermissions.canEdit && (
                    <TouchableOpacity
                      onPress={() => handleDeleteAttachment(att)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={{ position: "absolute", top: 6, right: 6, backgroundColor: "rgba(255,255,255,0.9)", borderRadius: 12, padding: 4 }}
                    >
                      <Feather name="trash-2" size={14} color={colors.destructive} />
                    </TouchableOpacity>
                  )}
                </View>
              ))
            )}
          </View>

          <View style={[styles.commentSection, { backgroundColor: colors.card }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Bình luận</Text>

            {loadingComments ? (
              <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 12 }} />
            ) : comments.length === 0 ? (
              <Text style={[styles.noComments, { color: colors.mutedForeground }]}>Chưa có bình luận nào</Text>
            ) : (
              comments.map((c) => (
                <View key={c.id} style={[styles.commentItem, { borderColor: colors.border }]}>
                  <View style={[styles.commentAvatar, { backgroundColor: (c.author?.id || c.authorId) ? getAvatarColor(c.author?.id || c.authorId!) : colors.muted }]}>
                    <Text style={styles.commentAvatarText}>{c.author ? getInitials(c.author) : (c.authorName ? c.authorName.charAt(0).toUpperCase() : "?")}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.commentHeader}>
                      <Text style={[styles.commentAuthor, { color: colors.foreground }]}>
                        {c.author?.name || c.author?.username || c.authorName || "Ẩn danh"}
                      </Text>
                      {c.createdAt && (
                        <Text style={[styles.commentTime, { color: colors.mutedForeground }]}>
                          {formatDate(c.createdAt)}
                        </Text>
                      )}
                    </View>
                    <HtmlText html={c.content ?? ""} style={{ color: colors.mutedForeground } as any} />
                  </View>
                </View>
              ))
            )}

            <View style={[styles.commentInput, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <TextInput
                style={[styles.commentTextInput, { color: colors.foreground }]}
                placeholder="Nhập bình luận..."
                placeholderTextColor={colors.mutedForeground}
                value={newComment}
                onChangeText={setNewComment}
                multiline
              />
              <TouchableOpacity
                style={[styles.sendBtn, { backgroundColor: newComment.trim() ? colors.primary : colors.muted }]}
                onPress={handleAddComment}
                disabled={!newComment.trim() || submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Feather name="send" size={16} color={newComment.trim() ? "#fff" : colors.mutedForeground} />
                )}
              </TouchableOpacity>
            </View>
          </View>

          <View style={{ height: insets.bottom + 32 }} />
        </ScrollView>
      </View>
    </Modal>
    <UserPickerModal
      visible={showManagerPicker}
      title="Chọn quản lý"
      users={users}
      selectedIds={editManagerId ? [editManagerId] : []}
      multi={false}
      onConfirm={(ids) => setEditManagerId(ids[0] || "")}
      onClose={() => setShowManagerPicker(false)}
      colors={colors}
    />
    <UserPickerModal
      visible={showAssigneesPicker}
      title="Chọn người thực hiện"
      users={users}
      selectedIds={editAssigneeIds}
      multi={true}
      onConfirm={(ids) => setEditAssigneeIds(ids)}
      onClose={() => setShowAssigneesPicker(false)}
      colors={colors}
    />
    <PeopleListPopup
      visible={showManagersPopup}
      title="Danh sách quản lý"
      people={managersToShow}
      onClose={() => setShowManagersPopup(false)}
      colors={colors}
      insets={insets}
    />
    <PeopleListPopup
      visible={showAssigneesPopup}
      title="Danh sách người thực hiện"
      people={assigneesToShow}
      onClose={() => setShowAssigneesPopup(false)}
      colors={colors}
      insets={insets}
    />
    {viewingFile && (
      <DocViewerModal file={viewingFile} onClose={() => setViewingFile(null)} />
    )}
    </>
  );
}

// ─── User Picker Modal ───────────────────────────────────────────────────────

function UserPickerModal({
  visible,
  title: modalTitle,
  users,
  selectedIds,
  multi = false,
  onConfirm,
  onClose,
  colors,
}: {
  visible: boolean;
  title: string;
  users: UserItem[];
  selectedIds: string[];
  multi?: boolean;
  onConfirm: (ids: string[]) => void;
  onClose: () => void;
  colors: any;
}) {
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState<string[]>(selectedIds);

  React.useEffect(() => {
    if (visible) { setSel(selectedIds); setQuery(""); }
  }, [visible]);

  const filtered = users.filter((u) => {
    const nm = (u.name || u.username).toLowerCase();
    return nm.includes(query.toLowerCase());
  });

  const toggle = (id: string) => {
    if (multi) {
      setSel((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
    } else {
      setSel((prev) => (prev[0] === id ? [] : [id]));
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback>
            <View style={[styles.createSheet, { backgroundColor: colors.card }]}>
              <View style={styles.sheetHandle} />
              <Text style={[styles.createTitle, { color: colors.foreground }]}>{modalTitle}</Text>

              <TextInput
                style={[styles.editTitleInput, { color: colors.foreground, borderColor: colors.border, marginTop: 6 }]}
                value={query}
                onChangeText={setQuery}
                placeholder="Tìm kiếm..."
                placeholderTextColor={colors.mutedForeground}
              />

              <ScrollView style={{ maxHeight: 260, marginTop: 8 }} keyboardShouldPersistTaps="handled">
                {!multi && (
                  <TouchableOpacity
                    style={[styles.userRow, { borderBottomColor: colors.border }]}
                    onPress={() => setSel([])}
                  >
                    <Text style={[styles.userRowName, { color: colors.mutedForeground, fontStyle: "italic" }]}>— Bỏ chọn —</Text>
                  </TouchableOpacity>
                )}
                {filtered.map((u) => {
                  const picked = sel.includes(u.id);
                  return (
                    <TouchableOpacity
                      key={u.id}
                      style={[styles.userRow, { borderBottomColor: colors.border, backgroundColor: picked ? hexToRgba(colors.primary, 0.08) : "transparent" }]}
                      onPress={() => toggle(u.id)}
                    >
                      <PersonAvatar person={{ id: u.id, name: u.name ?? undefined, username: u.username }} size={32} />
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={[styles.userRowName, { color: colors.foreground }]}>{u.name || u.username}</Text>
                        {u.name ? <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: "Inter_400Regular" }}>@{u.username}</Text> : null}
                      </View>
                      {picked && <Feather name="check" size={16} color={colors.primary} />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <View style={[styles.editActions, { marginTop: 12 }]}>
                <TouchableOpacity style={[styles.cancelBtn, { backgroundColor: colors.muted }]} onPress={onClose}>
                  <Text style={[styles.cancelBtnText, { color: colors.mutedForeground }]}>Hủy</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={() => { onConfirm(sel); onClose(); }}>
                  <Text style={styles.saveBtnText}>Xác nhận</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

// ─── People List Popup ───────────────────────────────────────────────────────

function PeopleListPopup({
  visible,
  title,
  people,
  onClose,
  colors,
  insets,
}: {
  visible: boolean;
  title: string;
  people: DetailPerson[];
  onClose: () => void;
  colors: any;
  insets: { bottom: number; top: number };
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback>
            <View style={[styles.peoplePopup, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
              <View style={styles.sheetHandle} />
              <Text style={[styles.createTitle, { color: colors.foreground }]}>{title}</Text>
              <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
                {people.map((p) => (
                  <View key={p.id} style={[styles.peoplePopupRow, { borderBottomColor: colors.border }]}>
                    <View style={[styles.detailPersonAvatar, { backgroundColor: getAvatarColor(p.id) }]}>
                      <Text style={styles.detailPersonAvatarText}>
                        {(p.fullName || "?").split(" ").map((w: string) => w[0] || "").join("").toUpperCase().slice(0, 2)}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.detailPersonName, { color: colors.foreground }]}>{p.fullName}{p.code ? ` (${p.code})` : ""}</Text>
                      {p.phone ? <Text style={[styles.detailPersonSub, { color: colors.mutedForeground }]}>{p.phone}</Text> : null}
                      {p.email ? <Text style={[styles.detailPersonSub, { color: colors.mutedForeground }]}>{p.email}</Text> : null}
                    </View>
                  </View>
                ))}
              </ScrollView>
              <TouchableOpacity
                style={[styles.cancelBtn, { backgroundColor: colors.muted, marginTop: 12 }]}
                onPress={onClose}
              >
                <Text style={[styles.cancelBtnText, { color: colors.mutedForeground }]}>Đóng</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

// ─── Calendar Picker ─────────────────────────────────────────────────────────

const WEEKDAYS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const MONTHS_VI = ["Tháng 1","Tháng 2","Tháng 3","Tháng 4","Tháng 5","Tháng 6","Tháng 7","Tháng 8","Tháng 9","Tháng 10","Tháng 11","Tháng 12"];

function CalendarPicker({
  visible,
  value,
  onSelect,
  onClose,
  colors,
  insets,
}: {
  visible: boolean;
  value: string;
  onSelect: (dateStr: string) => void;
  onClose: () => void;
  colors: any;
  insets: { bottom: number };
}) {
  const parseInput = (s: string): Date | null => {
    const parts = s.trim().split("/");
    if (parts.length !== 3) return null;
    const [d, m, y] = parts.map(Number);
    if (!d || !m || !y || y < 2000 || y > 2100) return null;
    const dt = new Date(y, m - 1, d);
    return isNaN(dt.getTime()) ? null : dt;
  };

  const initialDate = parseInput(value) || new Date();
  const [viewYear, setViewYear] = React.useState(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = React.useState(initialDate.getMonth());
  const [selected, setSelected] = React.useState<Date | null>(parseInput(value));
  const [manualText, setManualText] = React.useState(value);
  const [manualMode, setManualMode] = React.useState(false);

  React.useEffect(() => {
    if (visible) {
      const dt = parseInput(value) || new Date();
      setViewYear(dt.getFullYear());
      setViewMonth(dt.getMonth());
      setSelected(parseInput(value));
      setManualText(value);
      setManualMode(false);
    }
  }, [visible]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const selectDay = (day: number) => {
    const dt = new Date(viewYear, viewMonth, day);
    setSelected(dt);
    const str = `${String(day).padStart(2,"0")}/${String(viewMonth+1).padStart(2,"0")}/${viewYear}`;
    setManualText(str);
  };

  const handleConfirm = () => {
    if (manualMode) {
      const dt = parseInput(manualText);
      if (!dt) { Alert.alert("Ngày không hợp lệ", "Định dạng DD/MM/YYYY"); return; }
      const str = `${String(dt.getDate()).padStart(2,"0")}/${String(dt.getMonth()+1).padStart(2,"0")}/${dt.getFullYear()}`;
      onSelect(str);
    } else if (selected) {
      const str = `${String(selected.getDate()).padStart(2,"0")}/${String(selected.getMonth()+1).padStart(2,"0")}/${selected.getFullYear()}`;
      onSelect(str);
    }
    onClose();
  };

  const handleManualChange = (txt: string) => {
    setManualText(txt);
    const dt = parseInput(txt);
    if (dt) {
      setSelected(dt);
      setViewMonth(dt.getMonth());
      setViewYear(dt.getFullYear());
    }
  };

  const isSameDay = (day: number) => {
    if (!selected) return false;
    return selected.getDate() === day && selected.getMonth() === viewMonth && selected.getFullYear() === viewYear;
  };
  const isToday = (day: number) => today.getDate() === day && today.getMonth() === viewMonth && today.getFullYear() === viewYear;
  const isPast = (day: number) => new Date(viewYear, viewMonth, day) < today;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={calStyles.overlay}>
          <TouchableWithoutFeedback>
            <View style={[calStyles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
              <View style={styles.sheetHandle} />

              {/* Header */}
              <View style={calStyles.calHeader}>
                <TouchableOpacity onPress={onClose} style={calStyles.calCloseBtn}>
                  <Feather name="x" size={18} color={colors.mutedForeground} />
                </TouchableOpacity>
                <Text style={[calStyles.calTitle, { color: colors.foreground }]}>Chọn ngày</Text>
                <TouchableOpacity
                  style={[calStyles.confirmBtn, { backgroundColor: selected || parseInput(manualText) ? colors.primary : colors.muted }]}
                  onPress={handleConfirm}
                  disabled={!selected && !parseInput(manualText)}
                >
                  <Text style={[calStyles.confirmText, { color: selected || parseInput(manualText) ? "#fff" : colors.mutedForeground }]}>Xong</Text>
                </TouchableOpacity>
              </View>

              {/* Manual input */}
              <View style={[calStyles.manualRow, { borderColor: manualMode ? colors.primary : colors.border, backgroundColor: colors.background }]}>
                <Feather name="edit-2" size={14} color={manualMode ? colors.primary : colors.mutedForeground} />
                <TextInput
                  style={[calStyles.manualInput, { color: colors.foreground }]}
                  value={manualText}
                  onChangeText={handleManualChange}
                  onFocus={() => setManualMode(true)}
                  onBlur={() => setManualMode(false)}
                  placeholder="DD/MM/YYYY"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="numeric"
                />
                {manualText.length > 0 && (
                  <TouchableOpacity onPress={() => { setManualText(""); setSelected(null); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Feather name="x-circle" size={16} color={colors.mutedForeground} />
                  </TouchableOpacity>
                )}
              </View>

              {/* Month nav */}
              <View style={calStyles.monthNav}>
                <TouchableOpacity onPress={prevMonth} style={calStyles.navArrow} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Feather name="chevron-left" size={20} color={colors.foreground} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setViewMonth(today.getMonth()); setViewYear(today.getFullYear()); }}>
                  <Text style={[calStyles.monthLabel, { color: colors.foreground }]}>
                    {MONTHS_VI[viewMonth]} {viewYear}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={nextMonth} style={calStyles.navArrow} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Feather name="chevron-right" size={20} color={colors.foreground} />
                </TouchableOpacity>
              </View>

              {/* Weekday headers */}
              <View style={calStyles.weekRow}>
                {WEEKDAYS.map((w, i) => (
                  <Text key={w} style={[calStyles.weekday, { color: i === 0 ? "#ef4444" : colors.mutedForeground }]}>{w}</Text>
                ))}
              </View>

              {/* Day grid */}
              <View style={calStyles.dayGrid}>
                {cells.map((day, idx) => {
                  if (!day) return <View key={`e-${idx}`} style={calStyles.dayCell} />;
                  const sel = isSameDay(day);
                  const tod = isToday(day);
                  const past = isPast(day);
                  const sun = (idx % 7) === 0;
                  return (
                    <TouchableOpacity
                      key={`d-${day}`}
                      style={[
                        calStyles.dayCell,
                        sel && { backgroundColor: colors.primary, borderRadius: 10 },
                        tod && !sel && { borderWidth: 1.5, borderRadius: 10, borderColor: colors.primary },
                      ]}
                      onPress={() => selectDay(day)}
                      activeOpacity={0.7}
                    >
                      <Text style={[
                        calStyles.dayText,
                        { color: sel ? "#fff" : past ? colors.mutedForeground : sun ? "#ef4444" : colors.foreground },
                        sel && { fontFamily: "Inter_700Bold" },
                        tod && !sel && { color: colors.primary, fontFamily: "Inter_600SemiBold" },
                      ]}>
                        {day}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Today shortcut */}
              {!isSameDay(today.getDate()) && (
                <TouchableOpacity
                  style={[calStyles.todayBtn, { borderColor: colors.border }]}
                  onPress={() => { selectDay(today.getDate()); setViewMonth(today.getMonth()); setViewYear(today.getFullYear()); }}
                >
                  <Feather name="calendar" size={13} color={colors.primary} />
                  <Text style={[calStyles.todayText, { color: colors.primary }]}>Hôm nay</Text>
                </TouchableOpacity>
              )}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const calStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 8, paddingHorizontal: 16 },
  calHeader: { flexDirection: "row", alignItems: "center", paddingVertical: 10, gap: 8 },
  calCloseBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  calTitle: { flex: 1, fontSize: 16, fontFamily: "Inter_700Bold", textAlign: "center" },
  confirmBtn: { paddingHorizontal: 18, paddingVertical: 7, borderRadius: 20 },
  confirmText: { fontSize: 14, fontFamily: "Inter_700Bold" },
  manualRow: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 2, gap: 8, marginBottom: 12 },
  manualInput: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium", paddingVertical: 10 },
  monthNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  navArrow: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  monthLabel: { fontSize: 15, fontFamily: "Inter_700Bold" },
  weekRow: { flexDirection: "row", marginBottom: 4 },
  weekday: { flex: 1, textAlign: "center", fontSize: 12, fontFamily: "Inter_600SemiBold", paddingVertical: 4 },
  dayGrid: { flexDirection: "row", flexWrap: "wrap" },
  dayCell: { width: `${100/7}%` as any, aspectRatio: 1, alignItems: "center", justifyContent: "center" },
  dayText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  todayBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderRadius: 10, paddingVertical: 9, marginTop: 10 },
  todayText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
});

// ─── Create Task Modal ────────────────────────────────────────────────────────

function CreateTaskModal({
  visible,
  defaultStatusId,
  statuses,
  levels,
  users = [],
  subjects = [],
  colors,
  insets,
  onClose,
  onCreated,
}: {
  visible: boolean;
  defaultStatusId: string;
  statuses: Status[];
  levels: Level[];
  users: UserItem[];
  subjects: UserItem[];
  colors: any;
  insets: { bottom: number; top: number };
  onClose: () => void;
  onCreated: (task: Task) => void;
}) {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [statusId, setStatusId] = useState(defaultStatusId);
  const [levelId, setLevelId] = useState("");
  const [dueDateInput, setDueDateInput] = useState("");
  const [managerId, setManagerId] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [showManagerPicker, setShowManagerPicker] = useState(false);
  const [showAssigneesPicker, setShowAssigneesPicker] = useState(false);
  const [showSubjectsPicker, setShowSubjectsPicker] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [subjectIds, setSubjectIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  React.useEffect(() => {
    if (visible) {
      setTitle("");
      setDesc("");
      setStatusId(defaultStatusId);
      setLevelId("");
      setDueDateInput("");
      setManagerId("");
      setAssigneeIds([]);
      setSubjectIds([]);
    }
  }, [visible, defaultStatusId]);

  const managerUser = users.find((u) => u.id === managerId);
  const assigneeUsers = users.filter((u) => assigneeIds.includes(u.id));
  const subjectUsers = subjects.filter((u) => subjectIds.includes(u.id));
  const selectedStatus = statuses.find((s) => s.id === statusId);
  const selectedLevel = levels.find((l) => l.id === levelId);
  const isValid = title.trim().length > 0 && !!statusId;

  const handleCreate = async () => {
    if (!isValid) return;
    setSubmitting(true);
    try {
      const dueDateISO = dueDateInput.trim() ? parseDateInput(dueDateInput.trim()) : undefined;
      if (dueDateInput.trim() && !dueDateISO) {
        Alert.alert("Ngày không hợp lệ", "Vui lòng nhập định dạng DD/MM/YYYY");
        setSubmitting(false);
        return;
      }
      const { data } = await apiPost<Task>("/api/mobile/tasks", {
        title: title.trim(),
        content: desc.trim() || undefined,
        statusId,
        levelId: levelId || undefined,
        managerIds: managerId ? [managerId] : [],
        assigneeIds: assigneeIds.length > 0 ? assigneeIds : [],
        subjectIds: subjectIds.length > 0 ? subjectIds : [],
        dueDate: dueDateISO || undefined,
      });
      onCreated(data);
      onClose();
    } catch {
      Alert.alert("Lỗi", "Không thể tạo công việc");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
        <View style={[ctStyles.screen, { backgroundColor: colors.background }]}>

          {/* ── Header ── */}
          <View
            style={[ctStyles.header, { paddingTop: insets.top + 10, backgroundColor: colors.gradientStart }]}
          >
            <TouchableOpacity onPress={onClose} style={ctStyles.headerClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Feather name="x" size={20} color="#1e1b4b" />
            </TouchableOpacity>
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text style={ctStyles.headerTitle}>Tạo công việc</Text>
              <Text style={ctStyles.headerSub}>Điền thông tin bên dưới</Text>
            </View>
            <TouchableOpacity
              onPress={handleCreate}
              disabled={!isValid || submitting}
              style={[ctStyles.headerSave, { opacity: isValid ? 1 : 0.45 }]}
            >
              {submitting
                ? <ActivityIndicator size="small" color="#1e1b4b" />
                : <Text style={ctStyles.headerSaveText}>Tạo</Text>
              }
            </TouchableOpacity>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
          >

            {/* ── Tiêu đề + Mô tả ── */}
            <View style={[ctStyles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={ctStyles.sectionHeader}>
                <View style={[ctStyles.sectionIcon, { backgroundColor: hexToRgba(colors.primary, 0.12) }]}>
                  <Feather name="edit-3" size={14} color={colors.primary} />
                </View>
                <Text style={[ctStyles.sectionLabel, { color: colors.foreground }]}>Thông tin cơ bản</Text>
              </View>

              <View style={[ctStyles.inputWrapper, { borderColor: title.trim() ? colors.primary : colors.border, backgroundColor: colors.background }]}>
                <TextInput
                  style={[ctStyles.titleInput, { color: colors.foreground }]}
                  value={title}
                  onChangeText={setTitle}
                  placeholder="Tiêu đề công việc *"
                  placeholderTextColor={colors.mutedForeground}
                  autoFocus
                  returnKeyType="next"
                />
              </View>
              {title.trim().length === 0 && (
                <Text style={[ctStyles.fieldHint, { color: "#ef4444" }]}>* Bắt buộc</Text>
              )}

              <View style={[ctStyles.inputWrapper, { borderColor: colors.border, backgroundColor: colors.background, marginTop: 10 }]}>
                <TextInput
                  style={[ctStyles.descInput, { color: colors.foreground }]}
                  value={desc}
                  onChangeText={setDesc}
                  placeholder="Mô tả ngắn về công việc..."
                  placeholderTextColor={colors.mutedForeground}
                  multiline
                  textAlignVertical="top"
                />
              </View>

              <Text style={[ctStyles.fieldLabel, { color: colors.mutedForeground, marginTop: 12 }]}>Đối tượng</Text>
              <TouchableOpacity
                style={[ctStyles.personPicker, { borderColor: subjectIds.length > 0 ? "#10b981" : colors.border, backgroundColor: colors.background, minHeight: 52 }]}
                onPress={() => setShowSubjectsPicker(true)}
                activeOpacity={0.75}
              >
                {subjectUsers.length > 0 ? (
                  <View style={{ flex: 1 }}>
                    <View style={ctStyles.assigneeAvatarRow}>
                      {subjectUsers.slice(0, 5).map((a, i) => (
                        <View
                          key={a.id}
                          style={[ctStyles.personAvatar, { backgroundColor: getAvatarColor(a.id), marginLeft: i > 0 ? -8 : 0, borderWidth: 2, borderColor: colors.card }]}
                        >
                          <Text style={ctStyles.personAvatarText}>{getInitials({ id: a.id, name: a.name ?? undefined, username: a.username })}</Text>
                        </View>
                      ))}
                      {subjectUsers.length > 5 && (
                        <View style={[ctStyles.personAvatar, { backgroundColor: colors.muted, marginLeft: -8, borderWidth: 2, borderColor: colors.card }]}>
                          <Text style={[ctStyles.personAvatarText, { color: colors.mutedForeground, fontSize: 9 }]}>+{subjectUsers.length - 5}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[ctStyles.assigneeCount, { color: "#10b981" }]}>{subjectUsers.length} học viên</Text>
                  </View>
                ) : (
                  <View style={ctStyles.personPickerInner}>
                    <View style={[ctStyles.personAvatarEmpty, { borderColor: colors.border }]}>
                      <Feather name="user" size={14} color={colors.mutedForeground} />
                    </View>
                    <Text style={[ctStyles.personPlaceholder, { color: colors.mutedForeground }]}>Chọn học viên...</Text>
                    <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                  </View>
                )}
              </TouchableOpacity>
            </View>

            {/* ── Trạng thái ── */}
            <View style={[ctStyles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={ctStyles.sectionHeader}>
                <View style={[ctStyles.sectionIcon, { backgroundColor: hexToRgba("#6366f1", 0.12) }]}>
                  <Feather name="layers" size={14} color="#6366f1" />
                </View>
                <Text style={[ctStyles.sectionLabel, { color: colors.foreground }]}>Trạng thái</Text>
                {selectedStatus && (
                  <View style={[ctStyles.selectedBadge, { backgroundColor: hexToRgba(selectedStatus.color, 0.15), borderColor: hexToRgba(selectedStatus.color, 0.3) }]}>
                    <View style={[ctStyles.selectedDot, { backgroundColor: selectedStatus.color }]} />
                    <Text style={[ctStyles.selectedBadgeText, { color: selectedStatus.color }]}>{selectedStatus.name}</Text>
                  </View>
                )}
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -2 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 2, paddingBottom: 2 }}>
                {statuses.map((s) => {
                  const active = statusId === s.id;
                  return (
                    <TouchableOpacity
                      key={s.id}
                      onPress={() => setStatusId(s.id)}
                      activeOpacity={0.75}
                      style={[
                        ctStyles.levelChip,
                        {
                          backgroundColor: active ? hexToRgba(s.color, 0.15) : colors.background,
                          borderColor: active ? s.color : colors.border,
                          borderWidth: active ? 1.8 : 1,
                        },
                      ]}
                    >
                      <View style={[ctStyles.chipDot, { backgroundColor: s.color }]} />
                      <Text style={[ctStyles.chipText, { color: active ? s.color : colors.foreground, fontFamily: active ? "Inter_700Bold" : "Inter_500Medium" }]}>
                        {s.name}
                      </Text>
                      {active && <Feather name="check" size={12} color={s.color} style={{ marginLeft: 2 }} />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* ── Mức độ ưu tiên ── */}
            <View style={[ctStyles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={ctStyles.sectionHeader}>
                <View style={[ctStyles.sectionIcon, { backgroundColor: hexToRgba("#f59e0b", 0.12) }]}>
                  <Feather name="flag" size={14} color="#f59e0b" />
                </View>
                <Text style={[ctStyles.sectionLabel, { color: colors.foreground }]}>Mức độ ưu tiên</Text>
                {selectedLevel && (
                  <View style={[ctStyles.selectedBadge, { backgroundColor: hexToRgba(selectedLevel.color, 0.15), borderColor: hexToRgba(selectedLevel.color, 0.3) }]}>
                    <View style={[ctStyles.selectedDot, { backgroundColor: selectedLevel.color }]} />
                    <Text style={[ctStyles.selectedBadgeText, { color: selectedLevel.color }]}>{selectedLevel.name}</Text>
                  </View>
                )}
              </View>
              <View style={ctStyles.levelRow}>
                {levels.map((l) => {
                  const active = levelId === l.id;
                  return (
                    <TouchableOpacity
                      key={l.id}
                      onPress={() => setLevelId(active ? "" : l.id)}
                      activeOpacity={0.75}
                      style={[
                        ctStyles.levelChip,
                        {
                          backgroundColor: active ? hexToRgba(l.color, 0.15) : colors.background,
                          borderColor: active ? l.color : colors.border,
                          borderWidth: active ? 1.8 : 1,
                        },
                      ]}
                    >
                      <View style={[ctStyles.chipDot, { backgroundColor: l.color }]} />
                      <Text style={[ctStyles.chipText, { color: active ? l.color : colors.foreground, fontFamily: active ? "Inter_700Bold" : "Inter_500Medium" }]}>
                        {l.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* ── Hạn hoàn thành ── */}
            <View style={[ctStyles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={ctStyles.sectionHeader}>
                <View style={[ctStyles.sectionIcon, { backgroundColor: hexToRgba("#10b981", 0.12) }]}>
                  <Feather name="calendar" size={14} color="#10b981" />
                </View>
                <Text style={[ctStyles.sectionLabel, { color: colors.foreground }]}>Hạn hoàn thành</Text>
                {dueDateInput ? (
                  <TouchableOpacity onPress={() => setDueDateInput("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Feather name="x-circle" size={16} color={colors.mutedForeground} />
                  </TouchableOpacity>
                ) : null}
              </View>
              <TouchableOpacity
                style={[ctStyles.dateRow, { borderColor: dueDateInput ? "#10b981" : colors.border, backgroundColor: colors.background }]}
                onPress={() => setShowCalendar(true)}
                activeOpacity={0.75}
              >
                <Feather name="calendar" size={16} color={dueDateInput ? "#10b981" : colors.mutedForeground} />
                <Text style={[ctStyles.dateInput, { color: dueDateInput ? colors.foreground : colors.mutedForeground, paddingVertical: 12 }]}>
                  {dueDateInput || "Chọn ngày..."}
                </Text>
                <Feather name="chevron-right" size={15} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            {/* ── Nhân sự ── */}
            <View style={[ctStyles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={ctStyles.sectionHeader}>
                <View style={[ctStyles.sectionIcon, { backgroundColor: hexToRgba("#8b5cf6", 0.12) }]}>
                  <Feather name="users" size={14} color="#8b5cf6" />
                </View>
                <Text style={[ctStyles.sectionLabel, { color: colors.foreground }]}>Nhân sự</Text>
              </View>

              {/* Quản lý */}
              <Text style={[ctStyles.fieldLabel, { color: colors.mutedForeground }]}>Quản lý</Text>
              <TouchableOpacity
                style={[ctStyles.personPicker, { borderColor: managerId ? "#8b5cf6" : colors.border, backgroundColor: colors.background }]}
                onPress={() => setShowManagerPicker(true)}
                activeOpacity={0.75}
              >
                {managerUser ? (
                  <View style={ctStyles.personPickerInner}>
                    <View style={[ctStyles.personAvatar, { backgroundColor: getAvatarColor(managerUser.id) }]}>
                      <Text style={ctStyles.personAvatarText}>{getInitials({ id: managerUser.id, name: managerUser.name ?? undefined, username: managerUser.username })}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[ctStyles.personName, { color: colors.foreground }]}>{managerUser.name || managerUser.username}</Text>
                      {managerUser.name && <Text style={[ctStyles.personSub, { color: colors.mutedForeground }]}>@{managerUser.username}</Text>}
                    </View>
                    <TouchableOpacity onPress={() => setManagerId("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Feather name="x" size={14} color={colors.mutedForeground} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={ctStyles.personPickerInner}>
                    <View style={[ctStyles.personAvatarEmpty, { borderColor: colors.border }]}>
                      <Feather name="user-plus" size={14} color={colors.mutedForeground} />
                    </View>
                    <Text style={[ctStyles.personPlaceholder, { color: colors.mutedForeground }]}>Chọn quản lý...</Text>
                    <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                  </View>
                )}
              </TouchableOpacity>

              {/* Người thực hiện */}
              <Text style={[ctStyles.fieldLabel, { color: colors.mutedForeground, marginTop: 12 }]}>Người thực hiện</Text>
              <TouchableOpacity
                style={[ctStyles.personPicker, { borderColor: assigneeIds.length > 0 ? "#8b5cf6" : colors.border, backgroundColor: colors.background, minHeight: 52 }]}
                onPress={() => setShowAssigneesPicker(true)}
                activeOpacity={0.75}
              >
                {assigneeUsers.length > 0 ? (
                  <View style={{ flex: 1 }}>
                    <View style={ctStyles.assigneeAvatarRow}>
                      {assigneeUsers.slice(0, 5).map((a, i) => (
                        <View
                          key={a.id}
                          style={[ctStyles.personAvatar, { backgroundColor: getAvatarColor(a.id), marginLeft: i > 0 ? -8 : 0, borderWidth: 2, borderColor: colors.card }]}
                        >
                          <Text style={ctStyles.personAvatarText}>{getInitials({ id: a.id, name: a.name ?? undefined, username: a.username })}</Text>
                        </View>
                      ))}
                      {assigneeUsers.length > 5 && (
                        <View style={[ctStyles.personAvatar, { backgroundColor: colors.muted, marginLeft: -8, borderWidth: 2, borderColor: colors.card }]}>
                          <Text style={[ctStyles.personAvatarText, { color: colors.mutedForeground, fontSize: 9 }]}>+{assigneeUsers.length - 5}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[ctStyles.assigneeCount, { color: "#8b5cf6" }]}>{assigneeUsers.length} người được giao</Text>
                  </View>
                ) : (
                  <View style={ctStyles.personPickerInner}>
                    <View style={[ctStyles.personAvatarEmpty, { borderColor: colors.border }]}>
                      <Feather name="users" size={14} color={colors.mutedForeground} />
                    </View>
                    <Text style={[ctStyles.personPlaceholder, { color: colors.mutedForeground }]}>Chọn người thực hiện...</Text>
                    <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                  </View>
                )}
              </TouchableOpacity>
            </View>

            {/* ── Nút tạo ── */}
            <View style={{ paddingHorizontal: 16, marginTop: 4 }}>
              <TouchableOpacity
                style={[
                  ctStyles.createButton,
                  { backgroundColor: isValid ? colors.primary : colors.muted },
                ]}
                onPress={handleCreate}
                disabled={!isValid || submitting}
                activeOpacity={0.85}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Feather name="plus-circle" size={18} color={isValid ? "#fff" : colors.mutedForeground} />
                    <Text style={[ctStyles.createButtonText, { color: isValid ? "#fff" : colors.mutedForeground }]}>
                      Tạo công việc
                    </Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={[ctStyles.cancelButton, { borderColor: colors.border }]} onPress={onClose}>
                <Text style={[ctStyles.cancelButtonText, { color: colors.mutedForeground }]}>Hủy</Text>
              </TouchableOpacity>
            </View>

          </ScrollView>
        </View>
      </Modal>

      <UserPickerModal
        visible={showManagerPicker}
        title="Chọn quản lý"
        users={users}
        selectedIds={managerId ? [managerId] : []}
        multi={false}
        onConfirm={(ids) => setManagerId(ids[0] || "")}
        onClose={() => setShowManagerPicker(false)}
        colors={colors}
      />
      <UserPickerModal
        visible={showAssigneesPicker}
        title="Chọn người thực hiện"
        users={users}
        selectedIds={assigneeIds}
        multi={true}
        onConfirm={(ids) => setAssigneeIds(ids)}
        onClose={() => setShowAssigneesPicker(false)}
        colors={colors}
      />
      <UserPickerModal
        visible={showSubjectsPicker}
        title="Chọn đối tượng"
        users={subjects}
        selectedIds={subjectIds}
        multi={true}
        onConfirm={(ids) => setSubjectIds(ids)}
        onClose={() => setShowSubjectsPicker(false)}
        colors={colors}
      />
      <CalendarPicker
        visible={showCalendar}
        value={dueDateInput}
        onSelect={(str) => setDueDateInput(str)}
        onClose={() => setShowCalendar(false)}
        colors={colors}
        insets={insets}
      />
    </>
  );
}

const ctStyles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 18,
    gap: 8,
  },
  headerClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(30,27,75,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: "#1e1b4b",
  },
  headerSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "rgba(30,27,75,0.65)",
    marginTop: 1,
  },
  headerSave: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(30,27,75,0.12)",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 52,
  },
  headerSaveText: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: "#1e1b4b",
  },
  section: {
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },
  sectionIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionLabel: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    flex: 1,
  },
  selectedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
  },
  selectedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  selectedBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  inputWrapper: {
    borderWidth: 1.5,
    borderRadius: 12,
    overflow: "hidden",
  },
  titleInput: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    paddingHorizontal: 14,
    paddingVertical: 13,
    minHeight: 50,
  },
  descInput: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    minHeight: 90,
    lineHeight: 21,
  },
  fieldHint: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
    marginLeft: 2,
  },
  chipGrid: {
    gap: 8,
  },
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
    gap: 8,
  },
  chipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  chipText: {
    fontSize: 13,
  },
  levelRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  levelChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 24,
    gap: 6,
  },
  fieldLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    marginBottom: 6,
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 2,
    gap: 8,
  },
  dateInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    paddingVertical: 12,
  },
  personPicker: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 50,
    justifyContent: "center",
  },
  personPickerInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  personAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  personAvatarEmpty: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  personAvatarText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  personName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  personSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  personPlaceholder: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  assigneeAvatarRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
    paddingHorizontal: 2,
  },
  assigneeCount: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    paddingHorizontal: 2,
  },
  createButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
    borderRadius: 14,
  },
  createButtonText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  cancelButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
    borderRadius: 14,
    marginTop: 10,
    borderWidth: 1,
  },
  cancelButtonText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
});

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function TasksScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = insets.top;

  const [kanban, setKanban] = useState<KanbanResponse | null>(null);
  const [metaPermissions, setMetaPermissions] = useState<Permissions | null>(null);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [subjects, setSubjects] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("all");

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createStatusId, setCreateStatusId] = useState("");
  const pendingTaskIdRef = useRef<string | null>(null);

  const fetchKanban = async () => {
    try {
      setError(null);
      interface MetaStaff { id: string; fullName: string; code?: string; }
      interface MetaStudent { id: string; fullName: string; code?: string; }
      interface MetaResponse { permissions: Permissions; staff: MetaStaff[]; students: MetaStudent[]; }
      const [meta, data] = await Promise.all([
        apiGet<MetaResponse>("/api/mobile/tasks/meta"),
        apiGet<KanbanResponse>("/api/mobile/tasks/kanban"),
      ]);
      setMetaPermissions(meta.permissions);
      setKanban(data);
      setUsers(
        (meta.staff || []).map((s) => ({
          id: s.id,
          name: s.fullName,
          username: s.code || s.fullName,
          role: "staff",
        }))
      );
      setSubjects(
        (meta.students || []).map((s) => ({
          id: s.id,
          name: s.fullName,
          username: s.code || s.fullName,
          role: "student",
        }))
      );
    } catch (e: any) {
      if (e?.status === 403) {
        setError("Bạn không có quyền xem công việc.");
      } else {
        setError("Không thể tải dữ liệu. Vui lòng thử lại.");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      const dl = popTasksDeeplink();
      if (dl?.taskId) pendingTaskIdRef.current = dl.taskId;
      setLoading(true);
      fetchKanban();
    }, [])
  );

  // Auto-open task from deeplink once kanban data is loaded
  useEffect(() => {
    if (!pendingTaskIdRef.current || !kanban) return;
    const taskId = pendingTaskIdRef.current;
    pendingTaskIdRef.current = null;
    for (const col of kanban.columns) {
      const task = col.tasks.find(t => t.id === taskId);
      if (task) { setSelectedTask(task); setShowDetail(true); break; }
    }
  }, [kanban]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchKanban();
  };

  const handleTaskPress = (task: Task) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedTask(task);
    setShowDetail(true);
  };

  const handleAddTask = (statusId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCreateStatusId(statusId);
    setShowCreate(true);
  };

  const handleTaskDeleted = (id: string) => {
    setKanban((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        columns: prev.columns.map((col) => ({
          ...col,
          tasks: col.tasks.filter((t) => t.id !== id),
        })),
      };
    });
  };

  const handleTaskEdited = (updated: Task) => {
    setKanban((prev) => {
      if (!prev) return prev;
      const newColumns = prev.columns.map((col) => ({
        ...col,
        tasks: col.tasks.filter((t) => t.id !== updated.id),
      }));
      const targetCol = updated.status ? newColumns.find((col) => col.status?.id === updated.status.id) : null;
      if (targetCol) {
        targetCol.tasks = [...targetCol.tasks, updated];
      }
      return { ...prev, columns: newColumns };
    });
    setSelectedTask(updated);
  };

  const handleTaskCreated = (task: Task) => {
    setKanban((prev) => {
      if (!prev) return prev;
      const newColumns = prev.columns.map((col) => {
        if (col.status?.id === task.status?.id) {
          return { ...col, tasks: [task, ...col.tasks] };
        }
        return col;
      });
      return { ...prev, columns: newColumns };
    });
  };

  const allTasks = (kanban?.columns ?? []).flatMap((col) => col.tasks);
  const displayedTasks = activeTab === "all"
    ? allTasks
    : (kanban?.columns.find((col) => col.status?.id === activeTab)?.tasks ?? []);

  const tabs: TabItem[] = kanban
    ? [
        { id: "all", name: "Tất cả", color: colors.primary, count: allTasks.length },
        ...(kanban.columns ?? [])
          .filter((col) => col.status !== null)
          .map((col) => ({
            id: col.status!.id,
            name: col.status!.name,
            color: col.status!.color || "#6b7280",
            count: col.tasks.length,
          })),
      ]
    : [];

  const addStatusId =
    activeTab === "all" ? (kanban?.columns.find(c => c.status !== null)?.status?.id || "") : activeTab;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{ backgroundColor: colors.gradientStart, paddingTop: topPad + 16, paddingBottom: 16, paddingHorizontal: 20 }}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerTitle}>Công việc</Text>
            {kanban && (
              <Text style={styles.headerSub}>{allTasks.length} công việc · {kanban.columns.length} trạng thái</Text>
            )}
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={onRefresh}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Feather name="refresh-cw" size={18} color="#1e1b4b" />
            </TouchableOpacity>
            {metaPermissions?.canCreate && (
              <TouchableOpacity
                style={[styles.headerBtn, styles.createBtn]}
                onPress={() => handleAddTask(addStatusId)}
              >
                <Feather name="plus" size={18} color="#1e1b4b" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {kanban && (
        <StatusTabBar
          tabs={tabs}
          activeTab={activeTab}
          onSelect={setActiveTab}
          colors={colors}
        />
      )}

      {loading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Đang tải...</Text>
        </View>
      ) : error ? (
        <ScrollView
          contentContainerStyle={styles.center}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} progressBackgroundColor={colors.card} />}
        >
          <View style={[styles.errorBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="alert-circle" size={36} color="#ef4444" style={{ marginBottom: 12 }} />
            <Text style={[styles.errorText, { color: colors.foreground }]}>{error}</Text>
            <TouchableOpacity style={[styles.retryBtn, { backgroundColor: colors.primary }]} onPress={fetchKanban}>
              <Text style={styles.retryText}>Thử lại</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      ) : kanban ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} progressBackgroundColor={colors.card} />
          }
        >
          {displayedTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              colors={colors}
              onPress={() => handleTaskPress(task)}
              showStatus={activeTab === "all"}
              statuses={kanban?.statuses ?? []}
              users={users}
            />
          ))}
          {displayedTasks.length === 0 && (
            <View style={styles.emptyList}>
              <Feather name="inbox" size={44} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Không có công việc nào</Text>
            </View>
          )}
        </ScrollView>
      ) : null}

      {kanban && (
        <>
          <TaskDetailModal
            task={selectedTask}
            visible={showDetail}
            onClose={() => setShowDetail(false)}
            onDeleted={handleTaskDeleted}
            onEdited={handleTaskEdited}
            permissions={metaPermissions ?? kanban.permissions}
            statuses={kanban.statuses}
            levels={kanban.levels}
            users={users}
            colors={colors}
            insets={insets}
          />
          <CreateTaskModal
            visible={showCreate}
            defaultStatusId={createStatusId}
            statuses={kanban.statuses}
            levels={kanban.levels}
            users={users}
            subjects={subjects}
            colors={colors}
            insets={insets}
            onClose={() => setShowCreate(false)}
            onCreated={handleTaskCreated}
          />
        </>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: "#1e1b4b",
  },
  headerSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "rgba(30,27,75,0.65)",
    marginTop: 2,
  },
  headerRight: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(30,27,75,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  createBtn: {
    backgroundColor: "rgba(30,27,75,0.15)",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  errorBox: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 28,
    alignItems: "center",
    width: "100%",
  },
  errorText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
    marginBottom: 16,
  },
  retryBtn: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryText: {
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  tabBarWrapper: {
    borderBottomWidth: 1,
  },
  tabBarContent: {
    paddingHorizontal: 12,
    paddingTop: 4,
  },
  tabItem: {
    paddingHorizontal: 4,
    paddingBottom: 0,
    marginRight: 4,
    borderBottomWidth: 2.5,
    borderBottomColor: "transparent",
  },
  tabInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  tabLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  tabLabelActive: {
    fontFamily: "Inter_700Bold",
  },
  tabCount: {
    minWidth: 20,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  tabCountText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 100,
    gap: 10,
  },
  emptyList: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 12,
  },
  cardBadgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  cardBadgeStack: {
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 4,
    flexShrink: 0,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    gap: 4,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardAccent: {
    width: 4,
  },
  cardContent: {
    flex: 1,
    padding: 12,
    gap: 6,
  },
  levelBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    gap: 4,
  },
  levelDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  levelText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
  },
  cardTitle: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    lineHeight: 20,
  },
  cardDesc: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 17,
  },
  cardSep: {
    height: 1,
    marginVertical: 4,
  },
  cardDateRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardDateLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  cardDateText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  cardOverdueText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#ef4444",
  },
  cardPersonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 2,
  },
  cardPersonLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    width: 72,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  dueDateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  overdueBg: {
    backgroundColor: "#fee2e2",
  },
  dueDateText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  avatarRow: {
    flexDirection: "row",
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  avatarText: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  emptyCol: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
    gap: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "dashed",
  },
  emptyColText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  addCardBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    marginTop: 4,
  },
  addCardText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  detailSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "88%",
    minHeight: 300,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#d1d5db",
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 4,
  },
  detailHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    gap: 12,
  },
  detailActions: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 4,
  },
  statusTag: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 8,
    gap: 5,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusTagText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  detailTitle: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    lineHeight: 24,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  detailMeta: {
    padding: 16,
    borderBottomWidth: 1,
    gap: 10,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  metaLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    width: 80,
  },
  metaValue: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  descSection: {
    padding: 16,
    borderBottomWidth: 1,
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    marginBottom: 8,
  },
  descText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 21,
  },
  commentSection: {
    padding: 16,
    paddingBottom: 24,
  },
  noComments: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginBottom: 12,
  },
  commentItem: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  commentAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  commentAvatarText: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  commentHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 3,
  },
  commentAuthor: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  commentTime: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  commentText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
  },
  commentInput: {
    flexDirection: "row",
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "flex-end",
    padding: 10,
    gap: 8,
    marginTop: 12,
  },
  commentTextInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    maxHeight: 80,
    minHeight: 36,
    paddingTop: 4,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  editSection: {
    padding: 16,
    borderBottomWidth: 1,
  },
  editLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    marginBottom: 2,
  },
  editTitleInput: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    minHeight: 44,
  },
  editDescInput: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    minHeight: 80,
    textAlignVertical: "top",
  },
  selectChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    marginRight: 8,
  },
  selectChipText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  editActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  cancelBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  saveBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  saveBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  createSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingTop: 12,
  },
  createTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    marginBottom: 16,
    textAlign: "center",
  },
  detailFull: {
    flex: 1,
  },
  detailFullNav: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 10,
  },
  detailFullNavTitle: {
    flex: 1,
    fontSize: 17,
    fontFamily: "Inter_700Bold",
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  detailNavActions: {
    flexDirection: "row",
    gap: 8,
  },
  detailTitleSection: {
    padding: 16,
    borderBottomWidth: 1,
  },
  compactPersonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  compactAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  compactAvatarText: {
    color: "#fff",
    fontSize: 8,
    fontFamily: "Inter_700Bold",
  },
  compactPersonName: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  showMoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    marginTop: 2,
  },
  showMoreText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  peoplePopup: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingTop: 12,
  },
  peoplePopupRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  detailPersonCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 10,
    borderWidth: 1,
    padding: 8,
  },
  detailPersonAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  detailPersonAvatarText: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  detailPersonName: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  detailPersonSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  tagChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  tagChipText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  attachmentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    marginTop: 6,
  },
  attachmentName: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  attachmentSize: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  attachmentHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  attachmentUploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  attachmentUploadText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    gap: 0,
  },
  userRowName: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  dateInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  dateInputField: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  pickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
});
