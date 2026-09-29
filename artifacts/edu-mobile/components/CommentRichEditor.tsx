/**
 * CommentRichEditor — Native variant (iOS / Android).
 *
 * Dùng @10play/tentap-editor (TipTap/Prosemirror) backed by a WebView —
 * native keyboard, không có vấn đề scroll, HTML output tương thích web.
 *
 * Trên web Metro tự dùng CommentRichEditor.web.tsx thay file này.
 *
 * Image flow: pick from gallery → POST /api/upload → insert <img src>.
 */
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "@/hooks/useSafeAreaInsets";
import {
  RichText,
  TenTapStartKit,
  Toolbar,
  useEditorBridge,
  useEditorContent,
} from "@10play/tentap-editor";

import { useColors } from "@/hooks/useColors";
import { apiUpload } from "@/lib/api";

interface Props {
  student?: { fullName: string; code: string };
  initialHtml: string;
  onSave: (html: string) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function CommentRichEditor({
  student,
  initialHtml,
  onSave,
  onDelete,
  onClose,
}: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [uploading, setUploading] = useState(false);

  const editor = useEditorBridge({
    initialContent: initialHtml || "",
    bridgeExtensions: TenTapStartKit,
    avoidIosKeyboard: true,
    autofocus: true,
  });

  const content = useEditorContent(editor, { type: "html" });

  const handleSave = useCallback(() => {
    const html = (content ?? initialHtml) || "";
    onSave(html);
    onClose();
  }, [content, initialHtml, onSave, onClose]);

  const handlePickImage = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Cần quyền truy cập", "Vui lòng cho phép truy cập thư viện ảnh.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: false,
    });

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    setUploading(true);
    try {
      const uploaded = await apiUpload([
        {
          uri: asset.uri,
          name: asset.fileName ?? `img_${Date.now()}.jpg`,
          mimeType: asset.mimeType ?? "image/jpeg",
        },
      ]);
      if (uploaded[0]?.url) {
        editor.setImage(uploaded[0].url);
      } else {
        Alert.alert("Lỗi", "Không nhận được URL ảnh sau khi tải lên.");
      }
    } catch {
      Alert.alert("Lỗi", "Không thể tải ảnh lên. Vui lòng thử lại.");
    } finally {
      setUploading(false);
    }
  }, [editor]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* ── Header ── */}
      <View
        style={{
          paddingTop: insets.top + 12,
          paddingHorizontal: 16,
          paddingBottom: 14,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          backgroundColor: colors.card,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: colors.foreground }}>
            Nhận xét
          </Text>
          {student ? (
            <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 }}>
              {student.fullName}{student.code ? ` · ${student.code}` : ""}
            </Text>
          ) : null}
        </View>
        <TouchableOpacity onPress={onClose} style={{ padding: 8 }}>
          <Feather name="x" size={20} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      {/* ── Rich Text Editor ── */}
      <RichText
        editor={editor}
        style={{ flex: 1, backgroundColor: colors.background }}
      />

      {/* ── Bottom area ── */}
      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: colors.border,
          backgroundColor: colors.card,
          paddingBottom: insets.bottom,
        }}
      >
        {/* Image insert button */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 12,
            paddingVertical: 8,
            gap: 8,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        >
          <TouchableOpacity
            onPress={handlePickImage}
            disabled={uploading}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 8,
              backgroundColor: colors.primary + "15",
              borderWidth: 1,
              borderColor: colors.primary + "40",
            }}
          >
            {uploading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Feather name="image" size={16} color={colors.primary} />
            )}
            <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: colors.primary }}>
              {uploading ? "Đang tải ảnh..." : "Chèn ảnh"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Formatting toolbar */}
        <Toolbar editor={editor} />

        {/* Save / Delete */}
        <View
          style={{
            flexDirection: "row",
            gap: 10,
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderTopWidth: 1,
            borderTopColor: colors.border,
          }}
        >
          <TouchableOpacity
            onPress={() => { onDelete(); onClose(); }}
            style={{
              flex: 1,
              paddingVertical: 12,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: colors.mutedForeground }}>
              Xoá nhận xét
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSave}
            style={{
              flex: 1,
              paddingVertical: 12,
              borderRadius: 10,
              backgroundColor: colors.primary,
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" }}>
              Lưu
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
