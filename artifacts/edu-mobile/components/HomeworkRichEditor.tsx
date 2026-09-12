/**
 * HomeworkRichEditor — Native variant (iOS / Android).
 *
 * Rich-text editor cho học viên nộp BTVN: nhập text + chèn ảnh inline.
 * Dùng @10play/tentap-editor (TipTap/Prosemirror backed by WebView).
 *
 * Expose ref.getContent() → HTML string để SubmitModal lấy khi nộp bài.
 * Trên web Metro tự dùng HomeworkRichEditor.web.tsx thay file này.
 */
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { ActivityIndicator, Alert, Platform, Text, TouchableOpacity, View } from "react-native";
import {
  RichText,
  TenTapStartKit,
  Toolbar,
  useEditorBridge,
  useEditorContent,
  editorHtml,
} from "@10play/tentap-editor";

// Default CSS: image size constraints for the full-screen (non-expandable) editor.
const IMG_CONSTRAIN_CSS = `<style>
  .ProseMirror img {
    max-width: 180px !important;
    max-height: 140px !important;
    object-fit: contain !important;
    border-radius: 6px !important;
    display: inline-block !important;
  }
</style>`;

// Expandable mode CSS — two critical differences from the default ProseMirror stylesheet:
//
// 1. min-height: unset  — ProseMirror normally sets min-height: 100% so the editor
//    fills the WebView container height.  On Android this means scrollHeight ≈ viewport
//    height even for a single word, causing dynamicHeight to jump to full-screen size
//    immediately.  Removing min-height makes scrollHeight equal the actual content
//    height, so the editor grows one line at a time on both iOS and Android.
//
// 2. padding-bottom: 8px — keeps a small breathing room at the bottom.
const EXPANDABLE_CSS = `<style>
  .ProseMirror {
    min-height: unset !important;
    padding-bottom: 8px !important;
  }
  .ProseMirror img {
    max-width: 180px !important;
    max-height: 140px !important;
    object-fit: contain !important;
    border-radius: 6px !important;
    display: inline-block !important;
  }
</style>`;

import { useColors } from "@/hooks/useColors";
import { apiUpload } from "@/lib/api";

const editorHtmlWithImgCss = editorHtml.replace("</head>", IMG_CONSTRAIN_CSS + "</head>");
const editorHtmlExpandable  = editorHtml.replace("</head>", EXPANDABLE_CSS   + "</head>");

export interface HomeworkRichEditorHandle {
  getContent: () => string;
}

interface Props {
  initialHtml: string;
  /** Khi true: editor tự giãn theo nội dung (dùng trong ScrollView). Khi false (default): flex:1 chiếm toàn bộ không gian. */
  expandable?: boolean;
}

export const HomeworkRichEditor = forwardRef<HomeworkRichEditorHandle, Props>(
  ({ initialHtml, expandable = false }, ref) => {
    const colors = useColors();
    const [uploading, setUploading] = useState(false);
    const editor = useEditorBridge({
      initialContent: initialHtml || "",
      bridgeExtensions: TenTapStartKit,
      avoidIosKeyboard: true,
      autofocus: false,
      // Expandable mode uses EXPANDABLE_CSS which strips ProseMirror's min-height:100%.
      // Without that, scrollHeight = viewport height even for one word, causing dynamicHeight
      // to jump to full-screen on Android.  With min-height:unset, scrollHeight tracks
      // actual content — gradual growth works correctly on both iOS and Android.
      customSource: expandable ? editorHtmlExpandable : editorHtmlWithImgCss,
      dynamicHeight: expandable,
    });

    const content = useEditorContent(editor, { type: "html" });
    const contentRef = useRef<string>(initialHtml || "");
    useEffect(() => {
      if (content !== undefined && content !== null) {
        contentRef.current = content;
      }
    }, [content]);

    useImperativeHandle(ref, () => ({
      getContent: () => contentRef.current,
    }));

    const insertImageFromUri = useCallback(
      async (uri: string, fileName: string, mimeType: string) => {
        setUploading(true);
        try {
          const uploaded = await apiUpload([{ uri, name: fileName, mimeType }]);
          if (uploaded[0]?.url) {
            editor.setImage(uploaded[0].url);
          } else {
            Alert.alert("Lỗi", "Không nhận được URL ảnh.");
          }
        } catch {
          Alert.alert("Lỗi", "Không thể tải ảnh lên. Vui lòng thử lại.");
        } finally {
          setUploading(false);
        }
      },
      [editor]
    );

    const handleCamera = useCallback(async () => {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Cần quyền camera", "Hãy cho phép ứng dụng sử dụng camera.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ quality: 0.85 });
      if (!result.canceled && result.assets[0]) {
        await insertImageFromUri(
          result.assets[0].uri,
          `photo_${Date.now()}.jpg`,
          "image/jpeg"
        );
      }
    }, [insertImageFromUri]);

    const handleGallery = useCallback(async () => {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Cần quyền", "Vui lòng cho phép truy cập thư viện ảnh.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
        allowsEditing: false,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        await insertImageFromUri(
          asset.uri,
          asset.fileName ?? `img_${Date.now()}.jpg`,
          asset.mimeType ?? "image/jpeg"
        );
      }
    }, [insertImageFromUri]);

    return (
      <View style={expandable ? { minHeight: 120, backgroundColor: colors.muted } : { flex: 1, backgroundColor: colors.muted }}>
        {/* Rich text canvas */}
        {/* NOTE: do NOT pass containerStyle here — tentap's RichText spreads props onto
            the underlying WebView and overrides its own containerStyle which drives
            dynamicHeight (height: editorHeight).  Passing our own containerStyle
            silently kills auto-expand on iOS/Android.  minHeight lives on the outer
            View instead. */}
        <RichText
          editor={editor}
          style={expandable ? { backgroundColor: colors.muted } : { flex: 1, backgroundColor: colors.muted }}
          // nestedScrollEnabled lets Android's parent ScrollView co-exist with the
          // WebView — both can receive scroll gestures without one blocking the other.
          {...(expandable ? { nestedScrollEnabled: true } : {})}
        />

        {/* Bottom toolbar */}
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: colors.border,
            backgroundColor: colors.card,
          }}
        >
          {/* Image insert buttons */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 10,
              paddingVertical: 6,
              gap: 8,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <TouchableOpacity
              onPress={handleCamera}
              disabled={uploading}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                backgroundColor: "#f3e8ff",
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 5,
              }}
            >
              {uploading ? (
                <ActivityIndicator size="small" color="#7c3aed" />
              ) : (
                <Feather name="camera" size={13} color="#7c3aed" />
              )}
              <Text
                style={{
                  fontSize: 12,
                  fontFamily: "Inter_600SemiBold",
                  color: "#7c3aed",
                }}
              >
                {uploading ? "Đang tải..." : "Chụp ảnh"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleGallery}
              disabled={uploading}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                backgroundColor: colors.muted,
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 5,
              }}
            >
              <Feather name="image" size={13} color={colors.mutedForeground} />
              <Text
                style={{
                  fontSize: 12,
                  fontFamily: "Inter_600SemiBold",
                  color: colors.mutedForeground,
                }}
              >
                Chèn ảnh
              </Text>
            </TouchableOpacity>
          </View>

          {/* Formatting toolbar */}
          <Toolbar editor={editor} />
        </View>
      </View>
    );
  }
);

HomeworkRichEditor.displayName = "HomeworkRichEditor";
