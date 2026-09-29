import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as DocumentPicker from "expo-document-picker";
import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "@/hooks/useSafeAreaInsets";

import { useColors } from "@/hooks/useColors";
import { apiGet, apiPost, apiDelete, apiUpload } from "@/lib/api";

const MANUAL_CONTENT_TYPES = ["Bài học", "Bài tập về nhà", "Giáo trình"] as const;
type ContentType = "Bài học" | "Bài tập về nhà" | "Giáo trình" | "Bài kiểm tra";

interface SessionContent {
  id: string;
  classSessionId: string;
  contentType: ContentType;
  title: string;
  description?: string;
  resourceUrl?: string | null;
  displayOrder: number;
}

interface StudentContent {
  studentSessionContentId: string;
  sessionContentId: string;
  studentId: string;
  contentType: ContentType;
  title: string;
  description?: string | null;
  resourceUrl?: string | null;
}

interface LibraryItem {
  id: string;
  programId: string;
  sessionNumber: string;
  title: string;
  type: string;
  content?: string;
  attachments?: string[];
}

interface ExamItem {
  id: string;
  name: string;
  code: string;
  status: string;
  timeLimitMinutes?: number;
  passingScore?: number;
}

interface EnrolledStudent {
  studentId: string;
  studentName: string;
  studentCode: string;
}

interface PendingAdd {
  _key: string;
  contentType: ContentType;
  title: string;
  description?: string;
  resourceUrl?: string | null;
}

interface PendingStudentAdd {
  _key: string;
  studentId: string;
  studentName: string;
  contentType: ContentType;
  title: string;
  description?: string;
  resourceUrl?: string | null;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  classSessionId: string;
  onSaved?: () => void;
}

export function AssignContentSheet({ visible, onClose, classSessionId, onSaved }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState<"general" | "student">("general");
  const [loading, setLoading] = useState(false);

  const [generalContents, setGeneralContents] = useState<SessionContent[]>([]);
  const [studentContents, setStudentContents] = useState<StudentContent[]>([]);
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [exams, setExams] = useState<ExamItem[]>([]);
  const [students, setStudents] = useState<EnrolledStudent[]>([]);

  const [pendingGeneralAdds, setPendingGeneralAdds] = useState<PendingAdd[]>([]);
  const [pendingGeneralDeletes, setPendingGeneralDeletes] = useState<Set<string>>(new Set());

  const [pendingStudentAdds, setPendingStudentAdds] = useState<PendingStudentAdd[]>([]);
  const [pendingStudentDeletes, setPendingStudentDeletes] = useState<Set<string>>(new Set());

  const [saving, setSaving] = useState(false);

  const [showLibraryPicker, setShowLibraryPicker] = useState(false);
  const [librarySearchText, setLibrarySearchText] = useState("");
  const [libraryTab, setLibraryTab] = useState<"content" | "exam">("content");
  const [libraryTypeFilter, setLibraryTypeFilter] = useState<"Tất cả" | "Bài học" | "Bài tập về nhà" | "Giáo trình">("Tất cả");
  const [selectedLibraryIds, setSelectedLibraryIds] = useState<Set<string>>(new Set());
  const [selectedExamIds, setSelectedExamIds] = useState<Set<string>>(new Set());

  const [libraryLoaded, setLibraryLoaded] = useState(false);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryLoadingMore, setLibraryLoadingMore] = useState(false);
  const [libraryPage, setLibraryPage] = useState(1);
  const [libraryHasMore, setLibraryHasMore] = useState(false);
  const [libraryUseNewApi, setLibraryUseNewApi] = useState(true);

  const [examLoaded, setExamLoaded] = useState(false);
  const [examLoading, setExamLoading] = useState(false);
  const [examLoadingMore, setExamLoadingMore] = useState(false);
  const [examPage, setExamPage] = useState(1);
  const [examHasMore, setExamHasMore] = useState(false);
  const [examSearchQuery, setExamSearchQuery] = useState("");

  const [showManualForm, setShowManualForm] = useState(false);
  const [manualType, setManualType] = useState<"Bài học" | "Bài tập về nhà" | "Giáo trình">("Bài học");
  const [manualTitle, setManualTitle] = useState("");
  const [manualDesc, setManualDesc] = useState("");
  const [manualForStudent, setManualForStudent] = useState<EnrolledStudent | null>(null);
  const [manualAttachments, setManualAttachments] = useState<{ name: string; url: string }[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);

  const [showStudentPicker, setShowStudentPicker] = useState(false);
  const [pendingStudentForContent, setPendingStudentForContent] = useState<EnrolledStudent | null>(null);

  const keyRef = useRef(0);
  const nextKey = () => `k_${++keyRef.current}`;

  const load = useCallback(async () => {
    if (!classSessionId) return;
    setLoading(true);
    try {
      const [gc, sc] = await Promise.allSettled([
        apiGet<SessionContent[]>(`/api/mobile/staff/calendar/session/${classSessionId}/contents`),
        apiGet<StudentContent[]>(`/api/class-sessions/${classSessionId}/student-contents`),
      ]);
      if (gc.status === "fulfilled") {
        const v = gc.value as any;
        setGeneralContents(Array.isArray(v) ? v : (v?.items ?? v?.data ?? []));
      }
      if (sc.status === "fulfilled") {
        const v = sc.value as any;
        setStudentContents(Array.isArray(v) ? v : (v?.items ?? v?.data ?? []));
      }

      const att = await apiGet<{ studentId: string; studentName: string; studentCode: string }[]>(
        `/api/mobile/staff/calendar/session/${classSessionId}/students`
      ).catch(() => []);
      const attArr = Array.isArray(att) ? att : (att as any)?.items ?? (att as any)?.data ?? [];
      if (attArr.length > 0) {
        const unique = Array.from(new Map(attArr.map((s: any) => [s.studentId, s])).values()) as any[];
        setStudents(unique.map(s => ({ studentId: s.studentId, studentName: s.studentName, studentCode: s.studentCode })));
      }
    } finally {
      setLoading(false);
    }
  }, [classSessionId]);

  const PAGE_SIZE = 20;

  const loadLibrary = useCallback(async () => {
    if (libraryLoaded || libraryLoading) return;
    setLibraryLoading(true);
    try {
      const libNew = await apiGet<any>(`/api/mobile/staff/library?page=1&pageSize=${PAGE_SIZE}`);
      const isNewApiShape = libNew && typeof libNew === "object" && !Array.isArray(libNew) && ("items" in libNew || "total" in libNew);
      if (isNewApiShape) {
        const items = libNew.items ?? [];
        const total = libNew.total ?? items.length;
        setLibrary(items);
        setLibraryPage(1);
        setLibraryHasMore(items.length < total);
        setLibraryUseNewApi(true);
        setLibraryLoaded(true);
        return;
      }
      const itemsArr = Array.isArray(libNew) ? libNew : [];
      if (itemsArr.length > 0) {
        setLibrary(itemsArr);
        setLibraryHasMore(false);
        setLibraryUseNewApi(true);
        setLibraryLoaded(true);
        return;
      }
      // fallback to old endpoint
      const libOld = await apiGet<any>(`/api/course-program-contents`);
      const oldItems = Array.isArray(libOld) ? libOld : (libOld?.items ?? libOld?.data ?? []);
      setLibrary(oldItems);
      setLibraryHasMore(false);
      setLibraryUseNewApi(false);
      setLibraryLoaded(true);
    } catch {
      try {
        const libOld = await apiGet<any>(`/api/course-program-contents`);
        const oldItems = Array.isArray(libOld) ? libOld : (libOld?.items ?? libOld?.data ?? []);
        setLibrary(oldItems);
        setLibraryHasMore(false);
        setLibraryUseNewApi(false);
        setLibraryLoaded(true);
      } catch {}
    } finally {
      setLibraryLoading(false);
    }
  }, [libraryLoaded, libraryLoading]);

  const loadMoreLibrary = useCallback(async () => {
    if (libraryLoadingMore || !libraryHasMore || !libraryUseNewApi) return;
    setLibraryLoadingMore(true);
    const nextPage = libraryPage + 1;
    try {
      const res = await apiGet<any>(`/api/mobile/staff/library?page=${nextPage}&pageSize=${PAGE_SIZE}`);
      const items = res?.items ?? (Array.isArray(res) ? res : []);
      const total = res?.total ?? (library.length + items.length);
      setLibrary(prev => [...prev, ...items]);
      setLibraryPage(nextPage);
      setLibraryHasMore(library.length + items.length < total);
    } catch {} finally {
      setLibraryLoadingMore(false);
    }
  }, [libraryLoadingMore, libraryHasMore, libraryUseNewApi, libraryPage, library.length]);

  const loadExams = useCallback(async (search = "") => {
    setExamLoading(true);
    try {
      const params = new URLSearchParams({ pageSize: "500" });
      if (search.trim()) params.set("search", search.trim());
      const res = await apiGet<any>(`/api/mobile/staff/exams?${params.toString()}`);
      const items: ExamItem[] = res?.items ?? (Array.isArray(res) ? res : []);
      setExams(items);
      setExamLoaded(true);
    } catch (e: any) {
      setExams([]);
      setExamLoaded(true);
      Alert.alert("Lỗi tải bài kiểm tra", e?.message ?? String(e));
    } finally {
      setExamLoading(false);
      setExamLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      setPendingGeneralAdds([]);
      setPendingGeneralDeletes(new Set());
      setPendingStudentAdds([]);
      setPendingStudentDeletes(new Set());
      setLibraryLoaded(false);
      setLibraryLoading(false);
      setLibraryLoadingMore(false);
      setLibraryPage(1);
      setLibraryHasMore(false);
      setLibraryUseNewApi(true);
      setLibrary([]);
      setExamLoaded(false);
      setExamLoading(false);
      setExamLoadingMore(false);
      setExamPage(1);
      setExamHasMore(false);
      setExamSearchQuery("");
      setExams([]);
      setActiveTab("general");
      setShowLibraryPicker(false);
      setShowManualForm(false);
      load();
    }
  }, [visible, load]);

  const handleDeleteGeneral = (id: string) => {
    Haptics.selectionAsync();
    setPendingGeneralDeletes(prev => new Set([...prev, id]));
  };

  const handleUndoDeleteGeneral = (id: string) => {
    setPendingGeneralDeletes(prev => { const s = new Set(prev); s.delete(id); return s; });
  };

  const handleDeletePendingGeneral = (key: string) => {
    Haptics.selectionAsync();
    setPendingGeneralAdds(prev => prev.filter(p => p._key !== key));
  };

  const handleToggleLibraryItem = (item: LibraryItem) => {
    Haptics.selectionAsync();
    setSelectedLibraryIds(prev => {
      const next = new Set(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  };

  const handleToggleExamItem = (exam: ExamItem) => {
    Haptics.selectionAsync();
    setSelectedExamIds(prev => {
      const next = new Set(prev);
      if (next.has(exam.id)) next.delete(exam.id);
      else next.add(exam.id);
      return next;
    });
  };

  const handleConfirmLibrarySelection = () => {
    if (pendingStudentForContent) {
      const adds: PendingStudentAdd[] = [];
      library.forEach(item => {
        if (selectedLibraryIds.has(item.id)) {
          adds.push({
            _key: nextKey(),
            studentId: pendingStudentForContent.studentId,
            studentName: pendingStudentForContent.studentName,
            contentType: (item.type as ContentType) || "Bài học",
            title: item.title,
            description: item.content ? item.content.substring(0, 200) : undefined,
            resourceUrl: item.id,
          });
        }
      });
      exams.forEach(exam => {
        if (selectedExamIds.has(exam.id)) {
          adds.push({
            _key: nextKey(),
            studentId: pendingStudentForContent.studentId,
            studentName: pendingStudentForContent.studentName,
            contentType: "Bài kiểm tra",
            title: exam.name,
            description: `Mã đề: ${exam.code} · ${exam.timeLimitMinutes || 0} phút · Điểm đạt: ${exam.passingScore || 0}`,
            resourceUrl: exam.id,
          });
        }
      });
      if (adds.length > 0) setPendingStudentAdds(prev => [...prev, ...adds]);
      setPendingStudentForContent(null);
    } else {
      const adds: PendingAdd[] = [];
      library.forEach(item => {
        if (selectedLibraryIds.has(item.id)) {
          adds.push({
            _key: nextKey(),
            contentType: (item.type as ContentType) || "Bài học",
            title: item.title,
            description: item.content ? item.content.substring(0, 200) : undefined,
            resourceUrl: item.id,
          });
        }
      });
      exams.forEach(exam => {
        if (selectedExamIds.has(exam.id)) {
          adds.push({
            _key: nextKey(),
            contentType: "Bài kiểm tra",
            title: exam.name,
            description: `Mã đề: ${exam.code} · ${exam.timeLimitMinutes || 0} phút · Điểm đạt: ${exam.passingScore || 0}`,
            resourceUrl: exam.id,
          });
        }
      });
      if (adds.length > 0) setPendingGeneralAdds(prev => [...prev, ...adds]);
    }
    setShowLibraryPicker(false);
    setSelectedLibraryIds(new Set());
    setSelectedExamIds(new Set());
    setLibraryTypeFilter("Tất cả");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleCloseLibraryPicker = () => {
    setShowLibraryPicker(false);
    setSelectedLibraryIds(new Set());
    setSelectedExamIds(new Set());
    setLibraryTypeFilter("Tất cả");
    setPendingStudentForContent(null);
  };

  const openLibraryForStudent = (student: EnrolledStudent) => {
    setPendingStudentForContent(student);
    setSelectedLibraryIds(new Set());
    setSelectedExamIds(new Set());
    setLibrarySearchText("");
    setLibraryTypeFilter("Tất cả");
    setLibraryTab("content");
    setShowLibraryPicker(true);
    loadLibrary();
    Haptics.selectionAsync();
  };

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.length) return;
      setUploadingFile(true);
      const uploaded = await apiUpload(
        result.assets.map(a => ({ uri: a.uri, name: a.name, mimeType: a.mimeType }))
      );
      setManualAttachments(prev => [...prev, ...uploaded.map(f => ({ name: f.name, url: f.url }))]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert("Lỗi tải file", e?.message ?? "Không thể tải file lên. Vui lòng thử lại.");
    } finally {
      setUploadingFile(false);
    }
  };

  const [submittingManual, setSubmittingManual] = useState(false);

  const handleSubmitManual = async () => {
    if (!manualTitle.trim()) {
      Alert.alert("Thiếu thông tin", "Vui lòng nhập tiêu đề nội dung.");
      return;
    }
    setSubmittingManual(true);
    const title = manualTitle.trim();
    const description = manualDesc.trim() || undefined;
    const contentType = manualType;
    const forStudent = manualForStudent;

    // Lưu vào thư viện trước (10.9), lấy ID để dùng làm libraryContentId
    // "Bài kiểm tra" không được hỗ trợ bởi library API — chỉ lưu các loại khác
    const LIBRARY_SUPPORTED_TYPES = ["Bài học", "Bài tập về nhà", "Giáo trình"];
    let libraryId: string | null = null;
    if (LIBRARY_SUPPORTED_TYPES.includes(contentType)) {
      try {
        const attachmentStrings = manualAttachments.map(a => `${a.name}||${a.url}`);
        const result = await apiPost<{ id: string }>(`/api/mobile/staff/library`, {
          title,
          type: contentType,
          content: description ? `<p>${description}</p>` : null,
          programId: null,
          attachments: attachmentStrings,
          allowDownload: null,
        });
        libraryId = result?.data?.id ?? (result as any)?.id ?? null;
        if (libraryId) {
          // Thêm item mới vào danh sách thư viện local để refresh ngay
          setLibrary(prev => [{
            id: libraryId as string,
            title,
            type: contentType,
            content: description ? `<p>${description}</p>` : null,
            programId: null,
            attachments: attachmentStrings,
          } as any, ...prev]);
          console.log(`[Library] Đã lưu nội dung mới vào thư viện, id=${libraryId}`);
        } else {
          console.warn(`[Library] Lưu thành công nhưng không có id trả về`, result);
        }
      } catch (e: any) {
        console.log(`[Library] Lưu vào thư viện thất bại:`, e);
        setSubmittingManual(false);
        Alert.alert(
          "Không thể lưu vào thư viện",
          `Nội dung "${title}" không thể lưu vào thư viện. Lỗi: ${e?.message ?? "Không xác định"}.\n\nBạn có muốn giao nội dung này trực tiếp vào buổi học mà không lưu thư viện không?`,
          [
            { text: "Huỷ", style: "cancel" },
            {
              text: "Giao trực tiếp",
              onPress: () => {
                if (forStudent) {
                  setPendingStudentAdds(prev => [...prev, {
                    _key: nextKey(),
                    studentId: forStudent.studentId,
                    studentName: forStudent.studentName,
                    contentType,
                    title,
                    description,
                    resourceUrl: null,
                  }]);
                } else {
                  setPendingGeneralAdds(prev => [...prev, {
                    _key: nextKey(),
                    contentType,
                    title,
                    description,
                    resourceUrl: null,
                  }]);
                }
                setManualTitle("");
                setManualDesc("");
                setManualForStudent(null);
                setManualAttachments([]);
                setShowManualForm(false);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              },
            },
          ]
        );
        return;
      }
    }

    if (forStudent) {
      setPendingStudentAdds(prev => [...prev, {
        _key: nextKey(),
        studentId: forStudent.studentId,
        studentName: forStudent.studentName,
        contentType,
        title,
        description,
        resourceUrl: libraryId,
      }]);
    } else {
      setPendingGeneralAdds(prev => [...prev, {
        _key: nextKey(),
        contentType,
        title,
        description,
        resourceUrl: libraryId,
      }]);
    }
    setManualTitle("");
    setManualDesc("");
    setManualForStudent(null);
    setManualAttachments([]);
    setSubmittingManual(false);
    setShowManualForm(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleDeleteStudentContent = (id: string) => {
    Haptics.selectionAsync();
    setPendingStudentDeletes(prev => new Set([...prev, id]));
  };

  const handleUndoDeleteStudent = (id: string) => {
    setPendingStudentDeletes(prev => { const s = new Set(prev); s.delete(id); return s; });
  };

  const handleDeletePendingStudent = (key: string) => {
    Haptics.selectionAsync();
    setPendingStudentAdds(prev => prev.filter(p => p._key !== key));
  };

  const hasChanges =
    pendingGeneralAdds.length > 0 ||
    pendingGeneralDeletes.size > 0 ||
    pendingStudentAdds.length > 0 ||
    pendingStudentDeletes.size > 0;

  const handleSave = async () => {
    setSaving(true);
    Haptics.selectionAsync();
    try {
      const deleteJobs = [
        ...[...pendingGeneralDeletes].map(cid =>
          apiDelete(`/api/mobile/staff/calendar/session/${classSessionId}/contents/${cid}`)
        ),
        ...[...pendingStudentDeletes].map(cid =>
          apiDelete(`/api/class-sessions/${classSessionId}/contents/${cid}`)
        ),
      ];
      await Promise.all(deleteJobs.map(p => p.catch(() => {})));

      for (const item of pendingGeneralAdds) {
        try {
          await apiPost(`/api/mobile/staff/calendar/session/${classSessionId}/contents`, {
            contentType: item.contentType,
            title: item.title,
            description: item.description || null,
            libraryContentId: item.resourceUrl || null,
            dueDate: null,
          });
        } catch {}
      }

      for (const item of pendingStudentAdds) {
        try {
          await apiPost(`/api/class-sessions/${classSessionId}/student-contents`, {
            studentId: item.studentId,
            contentType: item.contentType,
            title: item.title,
            description: item.description || null,
            libraryContentId: item.resourceUrl || null,
          });
        } catch {}
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSaved?.();
      onClose();
    } catch {
      Alert.alert("Lỗi", "Không thể lưu nội dung. Vui lòng thử lại.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSaving(false);
    }
  };

  const searchedLibrary = library.filter(item =>
    item.title.toLowerCase().includes(librarySearchText.toLowerCase()) ||
    (item.type || "").toLowerCase().includes(librarySearchText.toLowerCase())
  );
  const filteredLibrary = searchedLibrary.filter(item =>
    libraryTypeFilter === "Tất cả" || item.type === libraryTypeFilter
  );
  // Exams come from server — no local filtering needed
  const filteredExams = exams;

  // Debounced exam search: when on exam tab and search text changes, re-fetch from server
  useEffect(() => {
    if (libraryTab !== "exam" || !examLoaded) return;
    const timer = setTimeout(() => {
      setExamSearchQuery(librarySearchText);
      loadExams(librarySearchText);
    }, 400);
    return () => clearTimeout(timer);
  }, [librarySearchText, libraryTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const TYPE_FILTER_OPTIONS = ["Tất cả", "Bài học", "Bài tập về nhà", "Giáo trình"] as const;
  const typeFilterCounts: Record<string, number> = {
    "Tất cả": searchedLibrary.length,
    "Bài học": searchedLibrary.filter(i => i.type === "Bài học").length,
    "Bài tập về nhà": searchedLibrary.filter(i => i.type === "Bài tập về nhà").length,
    "Giáo trình": searchedLibrary.filter(i => i.type === "Giáo trình").length,
  };

  const studentContentMap = new Map<string, StudentContent[]>();
  studentContents.forEach(sc => {
    if (!studentContentMap.has(sc.studentId)) studentContentMap.set(sc.studentId, []);
    studentContentMap.get(sc.studentId)!.push(sc);
  });

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>

        {/* Header */}
        <View style={{
          paddingTop: insets.top + 12,
          paddingHorizontal: 16, paddingBottom: 14,
          flexDirection: "row", alignItems: "center", gap: 12,
          borderBottomWidth: 1, borderBottomColor: colors.border,
          backgroundColor: colors.card,
        }}>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }}
          >
            <Feather name="arrow-left" size={20} color={colors.foreground} />
          </TouchableOpacity>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "#8b5cf620", alignItems: "center", justifyContent: "center" }}>
              <Feather name="send" size={15} color="#8b5cf6" />
            </View>
            <Text style={{ fontSize: 17, fontFamily: "Inter_700Bold", color: colors.foreground }}>Giao nội dung</Text>
          </View>
        </View>

        {/* Tabs */}
        <View style={{ flexDirection: "row", marginHorizontal: 16, marginTop: 14, backgroundColor: colors.muted, borderRadius: 10, padding: 3 }}>
          {(["general", "student"] as const).map(tab => (
            <TouchableOpacity
              key={tab}
              onPress={() => { setActiveTab(tab); Haptics.selectionAsync(); }}
              style={{
                flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: "center",
                backgroundColor: activeTab === tab ? colors.card : "transparent",
                shadowColor: activeTab === tab ? "#000" : "transparent",
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: activeTab === tab ? 0.06 : 0,
                shadowRadius: 4,
                elevation: activeTab === tab ? 2 : 0,
              }}
            >
              <Text style={{
                fontSize: 13, fontFamily: "Inter_600SemiBold",
                color: activeTab === tab ? colors.foreground : colors.mutedForeground,
              }}>
                {tab === "general" ? "Nội dung chung" : "Cá nhân"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator size="large" color="#8b5cf6" />
            <Text style={{ marginTop: 10, color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 13 }}>Đang tải...</Text>
          </View>
        ) : (
          <>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ padding: 16, gap: 10 }}
              style={{ flex: 1 }}
            >
                {activeTab === "general" ? (
                  <>
                    {/* Existing general contents */}
                    {generalContents.length === 0 && pendingGeneralAdds.length === 0 && (
                      <View style={{ alignItems: "center", paddingVertical: 24 }}>
                        <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
                          <Feather name="book-open" size={22} color={colors.mutedForeground} />
                        </View>
                        <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground, marginBottom: 4 }}>Chưa có nội dung</Text>
                        <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center" }}>Thêm nội dung từ thư viện hoặc tạo mới</Text>
                      </View>
                    )}

                    {generalContents.map(item => {
                      const isDeleted = pendingGeneralDeletes.has(item.id);
                      return (
                        <View key={item.id} style={{
                          flexDirection: "row", alignItems: "center", gap: 10,
                          backgroundColor: isDeleted ? "#fee2e210" : colors.card,
                          borderRadius: 12, padding: 12,
                          borderWidth: 1, borderColor: isDeleted ? "#ef4444" : colors.border,
                          opacity: isDeleted ? 0.55 : 1,
                        }}>
                          <TypeBadge type={item.contentType} />
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>{item.contentType}</Text>
                            <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: isDeleted ? "#ef4444" : colors.foreground }} numberOfLines={2}>{item.title}</Text>
                          </View>
                          {isDeleted ? (
                            <TouchableOpacity onPress={() => handleUndoDeleteGeneral(item.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                              <View style={{ backgroundColor: "#ef444420", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, flexDirection: "row", alignItems: "center", gap: 4 }}>
                                <Feather name="rotate-ccw" size={12} color="#ef4444" />
                                <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#ef4444" }}>Hoàn tác</Text>
                              </View>
                            </TouchableOpacity>
                          ) : (
                            <TouchableOpacity onPress={() => handleDeleteGeneral(item.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: "#ef444415", alignItems: "center", justifyContent: "center" }}>
                                <Feather name="trash-2" size={14} color="#ef4444" />
                              </View>
                            </TouchableOpacity>
                          )}
                        </View>
                      );
                    })}

                    {/* Pending adds */}
                    {pendingGeneralAdds.map(item => (
                      <View key={item._key} style={{
                        flexDirection: "row", alignItems: "center", gap: 10,
                        backgroundColor: "#8b5cf608",
                        borderRadius: 12, padding: 12,
                        borderWidth: 1, borderColor: "#8b5cf630", borderStyle: "dashed",
                      }}>
                        <TypeBadge type={item.contentType} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#8b5cf6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>{item.contentType} · Mới</Text>
                          <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: colors.foreground }} numberOfLines={2}>{item.title}</Text>
                        </View>
                        <TouchableOpacity onPress={() => handleDeletePendingGeneral(item._key)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: "#ef444415", alignItems: "center", justifyContent: "center" }}>
                            <Feather name="x" size={14} color="#ef4444" />
                          </View>
                        </TouchableOpacity>
                      </View>
                    ))}

                    {/* Add buttons */}
                    <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => { setSelectedLibraryIds(new Set()); setSelectedExamIds(new Set()); setLibrarySearchText(""); setLibraryTypeFilter("Tất cả"); setLibraryTab("content"); setShowLibraryPicker(true); loadLibrary(); Haptics.selectionAsync(); }}
                        style={{
                          flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
                          backgroundColor: "#8b5cf615", borderRadius: 12, paddingVertical: 11,
                          borderWidth: 1, borderColor: "#8b5cf630",
                        }}
                      >
                        <Feather name="book-open" size={15} color="#8b5cf6" />
                        <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#8b5cf6" }}>Từ thư viện</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => { setManualForStudent(null); setManualTitle(""); setManualDesc(""); setManualType("Bài học"); setShowManualForm(true); Haptics.selectionAsync(); }}
                        style={{
                          flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
                          backgroundColor: colors.card, borderRadius: 12, paddingVertical: 11,
                          borderWidth: 1, borderColor: colors.border,
                        }}
                      >
                        <Feather name="plus" size={15} color={colors.primary} />
                        <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.primary }}>Thêm nội dung</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : (
                  <>
                    {students.length === 0 ? (
                      <View style={{ alignItems: "center", paddingVertical: 32 }}>
                        <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
                          <Feather name="users" size={22} color={colors.mutedForeground} />
                        </View>
                        <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground, marginBottom: 4 }}>Không có học viên</Text>
                        <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center" }}>Chưa có học viên nào trong buổi học này</Text>
                      </View>
                    ) : students.map(s => {
                      const existingForStudent = studentContents.filter(c => c.studentId === s.studentId);
                      const pendingForStudent = pendingStudentAdds.filter(c => c.studentId === s.studentId);
                      const hasContent = existingForStudent.length > 0 || pendingForStudent.length > 0;
                      return (
                        <View key={s.studentId} style={{
                          backgroundColor: colors.card, borderRadius: 12,
                          borderWidth: 1, borderColor: colors.border, overflow: "hidden",
                        }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 10 }}>
                            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#6366f120", alignItems: "center", justifyContent: "center" }}>
                              <Feather name="user" size={16} color="#6366f1" />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>{s.studentName}</Text>
                              <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>{s.studentCode}</Text>
                            </View>
                            <TouchableOpacity
                              activeOpacity={0.7}
                              onPress={() => openLibraryForStudent(s)}
                              style={{
                                flexDirection: "row", alignItems: "center", gap: 4,
                                backgroundColor: "#8b5cf615", borderRadius: 10,
                                paddingHorizontal: 10, paddingVertical: 6,
                                borderWidth: 1, borderColor: "#8b5cf635",
                              }}
                            >
                              <Feather name="plus" size={13} color="#8b5cf6" />
                              <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#8b5cf6" }}>Thêm</Text>
                            </TouchableOpacity>
                          </View>

                          {hasContent && (
                            <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: 12, paddingVertical: 8, gap: 6 }}>
                              {existingForStudent.map(item => {
                                const isDeleted = pendingStudentDeletes.has(item.studentSessionContentId);
                                return (
                                  <View key={item.studentSessionContentId} style={{
                                    flexDirection: "row", alignItems: "center", gap: 8,
                                    opacity: isDeleted ? 0.5 : 1,
                                  }}>
                                    <TypeBadge type={item.contentType} small />
                                    <Text style={{ flex: 1, fontSize: 13, fontFamily: "Inter_500Medium", color: isDeleted ? "#ef4444" : colors.foreground }} numberOfLines={1}>{item.title}</Text>
                                    {isDeleted ? (
                                      <TouchableOpacity onPress={() => handleUndoDeleteStudent(item.studentSessionContentId)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                        <View style={{ backgroundColor: "#ef444420", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, flexDirection: "row", alignItems: "center", gap: 3 }}>
                                          <Feather name="rotate-ccw" size={11} color="#ef4444" />
                                          <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: "#ef4444" }}>Hoàn tác</Text>
                                        </View>
                                      </TouchableOpacity>
                                    ) : (
                                      <TouchableOpacity onPress={() => handleDeleteStudentContent(item.studentSessionContentId)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                        <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: "#ef444415", alignItems: "center", justifyContent: "center" }}>
                                          <Feather name="trash-2" size={12} color="#ef4444" />
                                        </View>
                                      </TouchableOpacity>
                                    )}
                                  </View>
                                );
                              })}
                              {pendingForStudent.map(item => (
                                <View key={item._key} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                                  <TypeBadge type={item.contentType} small />
                                  <Text style={{ flex: 1, fontSize: 13, fontFamily: "Inter_500Medium", color: "#8b5cf6" }} numberOfLines={1}>
                                    {item.title} <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11 }}>· Mới</Text>
                                  </Text>
                                  <TouchableOpacity onPress={() => handleDeletePendingStudent(item._key)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                    <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: "#ef444415", alignItems: "center", justifyContent: "center" }}>
                                      <Feather name="x" size={12} color="#ef4444" />
                                    </View>
                                  </TouchableOpacity>
                                </View>
                              ))}
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </>
                )}
              </ScrollView>

              {/* Save button */}
              <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={hasChanges ? handleSave : onClose}
                  disabled={saving}
                  style={{
                    backgroundColor: hasChanges ? "#8b5cf6" : colors.muted,
                    borderRadius: 14, paddingVertical: 14,
                    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
                  }}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Feather name={hasChanges ? "save" : "x"} size={17} color={hasChanges ? "#fff" : colors.mutedForeground} />
                  )}
                  <Text style={{
                    fontSize: 15, fontFamily: "Inter_700Bold",
                    color: hasChanges ? "#fff" : colors.mutedForeground,
                  }}>
                    {saving ? "Đang lưu..." : hasChanges ? `Giao nội dung` : "Đóng"}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

      {/* Library Picker Modal — full screen */}
      <Modal visible={showLibraryPicker} animationType="slide" transparent={false} onRequestClose={handleCloseLibraryPicker}>
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          {/* Header */}
          <View style={{
            paddingTop: insets.top + 8,
            flexDirection: "row", alignItems: "center", gap: 12,
            paddingHorizontal: 16, paddingBottom: 14,
            borderBottomWidth: 1, borderBottomColor: colors.border,
            backgroundColor: colors.background,
          }}>
            <TouchableOpacity
              onPress={handleCloseLibraryPicker}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }}
            >
              <Feather name="arrow-left" size={20} color={colors.foreground} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: colors.foreground }}>Thư viện nội dung</Text>
              {pendingStudentForContent && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 }}>
                  <Feather name="user" size={11} color="#6366f1" />
                  <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: "#6366f1" }}>
                    {pendingStudentForContent.studentName}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Search */}
          <View style={{ marginHorizontal: 16, marginTop: 14, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.muted, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }}>
            <Feather name="search" size={15} color={colors.mutedForeground} />
            <TextInput
              value={librarySearchText}
              onChangeText={setLibrarySearchText}
              placeholder="Tìm kiếm nội dung..."
              placeholderTextColor={colors.mutedForeground}
              style={{ flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", color: colors.foreground }}
            />
            {librarySearchText ? (
              <TouchableOpacity onPress={() => setLibrarySearchText("")}>
                <Feather name="x-circle" size={15} color={colors.mutedForeground} />
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Main tabs: Tài liệu / Bài kiểm tra */}
          <View style={{ flexDirection: "row", marginHorizontal: 16, marginTop: 12, backgroundColor: colors.muted, borderRadius: 10, padding: 3 }}>
            {(["content", "exam"] as const).map(t => (
              <TouchableOpacity
                key={t}
                onPress={() => {
                  setLibraryTab(t);
                  if (t === "exam" && !examLoaded && !examLoading) {
                    loadExams(librarySearchText);
                  }
                  Haptics.selectionAsync();
                }}
                style={{
                  flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center",
                  backgroundColor: libraryTab === t ? colors.card : "transparent",
                  shadowColor: libraryTab === t ? "#000" : "transparent",
                  shadowOffset: { width: 0, height: 1 }, shadowOpacity: libraryTab === t ? 0.06 : 0, shadowRadius: 4,
                  elevation: libraryTab === t ? 2 : 0,
                }}
              >
                <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: libraryTab === t ? colors.foreground : colors.mutedForeground }}>
                  {t === "content" ? `Tài liệu (${searchedLibrary.length})` : `Bài kiểm tra (${filteredExams.length})`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Type filter chips — only for Tài liệu tab */}
          {libraryTab === "content" && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ flexGrow: 0 }}
              contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8, alignItems: "center" }}
            >
              {TYPE_FILTER_OPTIONS.map(opt => {
                const active = libraryTypeFilter === opt;
                const c = opt === "Tất cả"
                  ? { bg: active ? "#8b5cf6" : colors.muted, text: active ? "#fff" : colors.mutedForeground, border: active ? "#8b5cf6" : colors.border }
                  : { bg: active ? TYPE_COLORS[opt]?.text : colors.muted, text: active ? "#fff" : colors.mutedForeground, border: active ? TYPE_COLORS[opt]?.text : colors.border };
                return (
                  <TouchableOpacity
                    key={opt}
                    onPress={() => { setLibraryTypeFilter(opt); Haptics.selectionAsync(); }}
                    style={{
                      flexDirection: "row", alignItems: "center", gap: 5,
                      backgroundColor: c.bg, borderRadius: 20,
                      paddingHorizontal: 13, paddingVertical: 7,
                      borderWidth: 1, borderColor: c.border,
                    }}
                  >
                    <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: c.text }}>
                      {opt}{opt !== "Tất cả" ? ` (${typeFilterCounts[opt]})` : ` (${typeFilterCounts["Tất cả"]})`}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 16, gap: 8 }}>
            {libraryTab === "content" ? (
              libraryLoading ? (
                <View style={{ alignItems: "center", paddingVertical: 48 }}>
                  <ActivityIndicator size="large" color="#8b5cf6" />
                  <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 14, marginTop: 12 }}>Đang tải thư viện...</Text>
                </View>
              ) : filteredLibrary.length === 0 ? (
                <View style={{ alignItems: "center", paddingVertical: 40 }}>
                  <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
                    <Feather name="search" size={22} color={colors.mutedForeground} />
                  </View>
                  <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 14 }}>Không tìm thấy tài liệu</Text>
                </View>
              ) : (
                <>
                  {filteredLibrary.map(item => {
                    const selected = selectedLibraryIds.has(item.id);
                    return (
                      <TouchableOpacity key={item.id} activeOpacity={0.8} onPress={() => handleToggleLibraryItem(item)} style={{
                        backgroundColor: selected ? "#8b5cf608" : colors.card, borderRadius: 12, padding: 12,
                        borderWidth: 1, borderColor: selected ? "#8b5cf650" : colors.border, gap: 6,
                      }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <TypeChip type={(item.type as ContentType) || "Bài học"} />
                          {item.sessionNumber ? (
                            <View style={{ backgroundColor: colors.muted, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
                              <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: colors.mutedForeground }}>Buổi {item.sessionNumber}</Text>
                            </View>
                          ) : null}
                          <View style={{ flex: 1 }} />
                          {selected ? (
                            <View style={{ backgroundColor: "#ef444415", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, flexDirection: "row", alignItems: "center", gap: 5 }}>
                              <Feather name="x" size={13} color="#ef4444" />
                              <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#ef4444" }}>Bỏ chọn</Text>
                            </View>
                          ) : (
                            <View style={{ backgroundColor: "#8b5cf615", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, flexDirection: "row", alignItems: "center", gap: 5 }}>
                              <Feather name="plus" size={13} color="#8b5cf6" />
                              <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#8b5cf6" }}>Thêm</Text>
                            </View>
                          )}
                        </View>
                        <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground }} numberOfLines={2}>{item.title}</Text>
                        {item.attachments && item.attachments.length > 0 && (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                            <Feather name="paperclip" size={11} color={colors.mutedForeground} />
                            <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>{item.attachments.length} file đính kèm</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                  {libraryHasMore && !librarySearchText && libraryTypeFilter === "Tất cả" && (
                    <TouchableOpacity
                      activeOpacity={0.75}
                      onPress={loadMoreLibrary}
                      disabled={libraryLoadingMore}
                      style={{
                        flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
                        paddingVertical: 14, borderRadius: 12,
                        backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border,
                        marginTop: 4,
                      }}
                    >
                      {libraryLoadingMore
                        ? <ActivityIndicator size="small" color="#8b5cf6" />
                        : <Feather name="chevron-down" size={16} color="#8b5cf6" />
                      }
                      <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#8b5cf6" }}>
                        {libraryLoadingMore ? "Đang tải..." : "Tải thêm"}
                      </Text>
                    </TouchableOpacity>
                  )}
                </>
              )
            ) : (
              examLoading ? (
                <View style={{ alignItems: "center", paddingVertical: 48 }}>
                  <ActivityIndicator size="large" color="#8b5cf6" />
                  <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 14, marginTop: 12 }}>Đang tải bài kiểm tra...</Text>
                </View>
              ) : filteredExams.length === 0 ? (
                <View style={{ alignItems: "center", paddingVertical: 40 }}>
                  <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
                    <Feather name="search" size={22} color={colors.mutedForeground} />
                  </View>
                  <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 14 }}>Không tìm thấy bài kiểm tra</Text>
                </View>
              ) : (
                <>
                  {filteredExams.map(exam => {
                const selected = selectedExamIds.has(exam.id);
                return (
                  <TouchableOpacity key={exam.id} activeOpacity={0.8} onPress={() => handleToggleExamItem(exam)} style={{
                    backgroundColor: selected ? "#8b5cf608" : colors.card, borderRadius: 12, padding: 12,
                    borderWidth: 1, borderColor: selected ? "#8b5cf650" : colors.border, gap: 6,
                  }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <TypeChip type="Bài kiểm tra" />
                      <View style={{ backgroundColor: colors.muted, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: colors.mutedForeground }}>{exam.code}</Text>
                      </View>
                      <View style={{ flex: 1 }} />
                      {selected ? (
                        <View style={{ backgroundColor: "#ef444415", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, flexDirection: "row", alignItems: "center", gap: 5 }}>
                          <Feather name="x" size={13} color="#ef4444" />
                          <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#ef4444" }}>Bỏ chọn</Text>
                        </View>
                      ) : (
                        <View style={{ backgroundColor: "#8b5cf615", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, flexDirection: "row", alignItems: "center", gap: 5 }}>
                          <Feather name="plus" size={13} color="#8b5cf6" />
                          <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#8b5cf6" }}>Thêm</Text>
                        </View>
                      )}
                    </View>
                    <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground }} numberOfLines={1}>{exam.name}</Text>
                    <View style={{ flexDirection: "row", gap: 10 }}>
                      {exam.timeLimitMinutes ? <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>{exam.timeLimitMinutes} phút</Text> : null}
                      {exam.passingScore ? <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>Điểm đạt: {exam.passingScore}</Text> : null}
                    </View>
                  </TouchableOpacity>
                );
              })}
                </>
              )
            )}
          </ScrollView>

          {/* Bottom confirm bar */}
          {(selectedLibraryIds.size + selectedExamIds.size) > 0 && (
            <View style={{
              paddingHorizontal: 16, paddingTop: 12, paddingBottom: insets.bottom + 12,
              borderTopWidth: 1, borderTopColor: colors.border,
              backgroundColor: colors.background, gap: 10,
            }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 6, alignItems: "center" }}>
                {[...selectedLibraryIds].map(id => {
                  const item = library.find(l => l.id === id);
                  if (!item) return null;
                  return (
                    <View key={id} style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#8b5cf615", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: "#8b5cf630" }}>
                      <TypeChip type={(item.type as ContentType) || "Bài học"} />
                      <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: colors.foreground, maxWidth: 140 }} numberOfLines={1}>{item.title}</Text>
                      <TouchableOpacity onPress={() => handleToggleLibraryItem(item)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                        <Feather name="x" size={12} color={colors.mutedForeground} />
                      </TouchableOpacity>
                    </View>
                  );
                })}
                {[...selectedExamIds].map(id => {
                  const exam = exams.find(e => e.id === id);
                  if (!exam) return null;
                  return (
                    <View key={id} style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#ef444415", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: "#ef444430" }}>
                      <TypeChip type="Bài kiểm tra" />
                      <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: colors.foreground, maxWidth: 140 }} numberOfLines={1}>{exam.name}</Text>
                      <TouchableOpacity onPress={() => handleToggleExamItem(exam)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                        <Feather name="x" size={12} color={colors.mutedForeground} />
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </ScrollView>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={handleConfirmLibrarySelection}
                style={{
                  backgroundColor: "#8b5cf6", borderRadius: 14, paddingVertical: 13,
                  flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
                }}
              >
                <Feather name="check" size={17} color="#fff" />
                <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" }}>
                  Xong · {selectedLibraryIds.size + selectedExamIds.size} nội dung
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>

      {/* Manual Add Form Modal */}
      <Modal visible={showManualForm} animationType="slide" transparent={false} onRequestClose={() => setShowManualForm(false)}>
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          {/* Header */}
          <View style={{
            paddingTop: insets.top + 8,
            flexDirection: "row", alignItems: "center", gap: 12,
            paddingHorizontal: 16, paddingBottom: 14,
            borderBottomWidth: 1, borderBottomColor: colors.border,
            backgroundColor: colors.background,
          }}>
            <TouchableOpacity
              onPress={() => setShowManualForm(false)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }}
            >
              <Feather name="arrow-left" size={20} color={colors.foreground} />
            </TouchableOpacity>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "#8b5cf620", alignItems: "center", justifyContent: "center" }}>
                <Feather name="plus-circle" size={15} color="#8b5cf6" />
              </View>
              <Text style={{ fontSize: 17, fontFamily: "Inter_700Bold", color: colors.foreground }} numberOfLines={1}>
                {manualForStudent ? `Thêm cho ${manualForStudent.studentName}` : "Thêm nội dung"}
              </Text>
            </View>
          </View>

          {/* Scrollable form */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 8 }}
          >
            {/* Type selector */}
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.5 }}>Loại nội dung</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {MANUAL_CONTENT_TYPES.map(type => (
                  <TouchableOpacity key={type} onPress={() => { setManualType(type); Haptics.selectionAsync(); }} style={{
                    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
                    backgroundColor: manualType === type ? "#8b5cf6" : colors.muted,
                    borderWidth: 1, borderColor: manualType === type ? "#8b5cf6" : colors.border,
                  }}>
                    <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: manualType === type ? "#fff" : colors.mutedForeground }}>{type}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Title */}
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.5 }}>Tiêu đề <Text style={{ color: "#ef4444" }}>*</Text></Text>
              <TextInput
                value={manualTitle}
                onChangeText={setManualTitle}
                placeholder="Nhập tiêu đề nội dung..."
                placeholderTextColor={colors.mutedForeground}
                style={{
                  backgroundColor: colors.muted, borderRadius: 12,
                  paddingHorizontal: 14, paddingVertical: 11,
                  fontSize: 14, fontFamily: "Inter_400Regular", color: colors.foreground,
                  borderWidth: 1, borderColor: colors.border,
                }}
              />
            </View>

            {/* Description */}
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.5 }}>Mô tả (tùy chọn)</Text>
              <TextInput
                value={manualDesc}
                onChangeText={setManualDesc}
                placeholder="Mô tả thêm về nội dung..."
                placeholderTextColor={colors.mutedForeground}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                style={{
                  backgroundColor: colors.muted, borderRadius: 12,
                  paddingHorizontal: 14, paddingVertical: 11,
                  fontSize: 14, fontFamily: "Inter_400Regular", color: colors.foreground,
                  borderWidth: 1, borderColor: colors.border, minHeight: 80,
                }}
              />
            </View>

            {/* Attachments */}
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.5 }}>Đính kèm file</Text>
              {manualAttachments.map((att, idx) => (
                <View key={idx} style={{
                  flexDirection: "row", alignItems: "center", gap: 10,
                  backgroundColor: colors.muted, borderRadius: 10,
                  paddingHorizontal: 12, paddingVertical: 9,
                  borderWidth: 1, borderColor: colors.border,
                }}>
                  <Feather name="paperclip" size={14} color="#8b5cf6" />
                  <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: colors.foreground }}>{att.name}</Text>
                  <TouchableOpacity
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    onPress={() => { setManualAttachments(prev => prev.filter((_, i) => i !== idx)); Haptics.selectionAsync(); }}
                  >
                    <Feather name="x" size={15} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={handlePickFile}
                disabled={uploadingFile}
                style={{
                  flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7,
                  backgroundColor: colors.muted, borderRadius: 10, paddingVertical: 10,
                  borderWidth: 1, borderColor: colors.border, borderStyle: "dashed",
                }}
              >
                {uploadingFile
                  ? <ActivityIndicator size="small" color="#8b5cf6" />
                  : <Feather name="upload" size={14} color="#8b5cf6" />
                }
                <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#8b5cf6" }}>
                  {uploadingFile ? "Đang tải lên..." : "Chọn file đính kèm"}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>

          {/* Submit button pinned to bottom */}
          <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: insets.bottom + 16, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background }}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleSubmitManual}
              disabled={submittingManual || uploadingFile}
              style={{
                backgroundColor: submittingManual || uploadingFile ? colors.muted : "#8b5cf6",
                borderRadius: 14, paddingVertical: 14,
                flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
              }}
            >
              {submittingManual
                ? <ActivityIndicator size="small" color="#fff" />
                : <Feather name="plus" size={17} color={submittingManual || uploadingFile ? colors.mutedForeground : "#fff"} />
              }
              <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: submittingManual || uploadingFile ? colors.mutedForeground : "#fff" }}>
                {submittingManual ? "Đang lưu..." : "Thêm nội dung"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Student Picker Modal */}
      <Modal visible={showStudentPicker} animationType="slide" transparent onRequestClose={() => setShowStudentPicker(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }}>
          <TouchableWithoutFeedback onPress={() => setShowStudentPicker(false)}>
            <View style={{ position: "absolute", inset: 0 }} />
          </TouchableWithoutFeedback>
          <View style={{
            backgroundColor: colors.background,
            borderTopLeftRadius: 24, borderTopRightRadius: 24,
            maxHeight: "75%", paddingBottom: insets.bottom + 12,
          }}>
            <View style={{ alignItems: "center", paddingTop: 12, paddingBottom: 4 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
            </View>
            <View style={{
              flexDirection: "row", alignItems: "center", justifyContent: "space-between",
              paddingHorizontal: 20, paddingVertical: 14,
              borderBottomWidth: 1, borderBottomColor: colors.border,
            }}>
              <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: colors.foreground }}>Chọn học viên</Text>
              <TouchableOpacity onPress={() => setShowStudentPicker(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }}>
                  <Feather name="x" size={16} color={colors.mutedForeground} />
                </View>
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, gap: 8 }}>
              {students.length === 0 && (
                <View style={{ alignItems: "center", paddingVertical: 32, gap: 8 }}>
                  <Feather name="users" size={36} color={colors.mutedForeground} />
                  <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>Không có học viên</Text>
                  <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center" }}>
                    Không tìm thấy danh sách học viên cho buổi học này
                  </Text>
                </View>
              )}
              {students.map(s => (
                <TouchableOpacity
                  key={s.studentId}
                  activeOpacity={0.8}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setShowStudentPicker(false);
                    setManualForStudent(s);
                    setManualTitle("");
                    setManualDesc("");
                    setManualType("Bài tập về nhà");
                    setShowManualForm(true);
                  }}
                  style={{
                    flexDirection: "row", alignItems: "center", gap: 12,
                    backgroundColor: colors.card, borderRadius: 12, padding: 12,
                    borderWidth: 1, borderColor: colors.border,
                  }}
                >
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#6366f120", alignItems: "center", justifyContent: "center" }}>
                    <Feather name="user" size={16} color="#6366f1" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>{s.studentName}</Text>
                    <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>{s.studentCode}</Text>
                  </View>
                  <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  "Bài học":         { bg: "#3b82f620", text: "#3b82f6" },
  "Bài tập về nhà": { bg: "#f9731620", text: "#f97316" },
  "Giáo trình":      { bg: "#10b98120", text: "#10b981" },
  "Bài kiểm tra":    { bg: "#ef444420", text: "#ef4444" },
};

function TypeBadge({ type, small }: { type: string; small?: boolean }) {
  const c = TYPE_COLORS[type] || { bg: "#8b5cf620", text: "#8b5cf6" };
  const icons: Record<string, string> = {
    "Bài học":         "book",
    "Bài tập về nhà": "edit-3",
    "Giáo trình":      "book-open",
    "Bài kiểm tra":    "clipboard",
  };
  return (
    <View style={{
      width: small ? 26 : 32, height: small ? 26 : 32,
      borderRadius: small ? 13 : 16,
      backgroundColor: c.bg,
      alignItems: "center", justifyContent: "center", flexShrink: 0,
    }}>
      <Feather name={(icons[type] || "file") as any} size={small ? 12 : 14} color={c.text} />
    </View>
  );
}

function TypeChip({ type }: { type: string }) {
  const c = TYPE_COLORS[type] || { bg: "#8b5cf620", text: "#8b5cf6" };
  const icons: Record<string, string> = {
    "Bài học":         "book",
    "Bài tập về nhà": "edit-3",
    "Giáo trình":      "book-open",
    "Bài kiểm tra":    "clipboard",
  };
  return (
    <View style={{
      flexDirection: "row", alignItems: "center", gap: 5,
      backgroundColor: c.bg, borderRadius: 20,
      paddingHorizontal: 9, paddingVertical: 4, flexShrink: 0,
    }}>
      <Feather name={(icons[type] || "file") as any} size={11} color={c.text} />
      <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: c.text }}>{type || "Tài liệu"}</Text>
    </View>
  );
}
