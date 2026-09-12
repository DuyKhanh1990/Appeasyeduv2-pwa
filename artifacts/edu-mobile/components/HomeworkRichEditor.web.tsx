/**
 * HomeworkRichEditor — Web variant (Expo Web / browser).
 *
 * Rich-text editor cho học viên nộp BTVN: nhập text + chèn ảnh inline.
 * Dùng TipTap React trực tiếp — không cần WebView.
 *
 * Expose ref.getContent() → HTML string để SubmitModal lấy khi nộp bài.
 * Metro bundler tự động dùng file này thay cho HomeworkRichEditor.tsx khi build web.
 */
import { Feather } from "@expo/vector-icons";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TipTapImage from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import React, { forwardRef, useCallback, useImperativeHandle, useRef } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { apiUpload } from "@/lib/api";

export interface HomeworkRichEditorHandle {
  getContent: () => string;
}

interface Props {
  initialHtml: string;
  expandable?: boolean;
}

function injectEditorStyles(primaryColor: string) {
  const id = "tiptap-homework-styles";
  if (typeof document === "undefined" || document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = `
    .tiptap-homework-editor .ProseMirror {
      outline: none;
      min-height: 140px;
      font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
      font-size: 15px;
      line-height: 1.6;
      padding: 12px 14px;
      color: inherit;
    }
    .tiptap-homework-editor .ProseMirror p { margin: 0 0 8px 0; }
    .tiptap-homework-editor .ProseMirror p:last-child { margin-bottom: 0; }
    .tiptap-homework-editor .ProseMirror ul,
    .tiptap-homework-editor .ProseMirror ol { padding-left: 20px; margin: 0 0 8px 0; }
    .tiptap-homework-editor .ProseMirror li { margin-bottom: 2px; }
    .tiptap-homework-editor .ProseMirror strong { font-weight: 700; }
    .tiptap-homework-editor .ProseMirror em { font-style: italic; }
    .tiptap-homework-editor .ProseMirror h1 { font-size: 22px; font-weight: 700; margin: 0 0 8px 0; }
    .tiptap-homework-editor .ProseMirror h2 { font-size: 18px; font-weight: 700; margin: 0 0 8px 0; }
    .tiptap-homework-editor .ProseMirror img { max-width: 180px; max-height: 140px; object-fit: contain; border-radius: 6px; margin: 4px 0; display: inline-block; }
    .tiptap-homework-editor .ProseMirror blockquote {
      border-left: 3px solid ${primaryColor};
      margin: 0 0 8px 0;
      padding-left: 12px;
      color: #888;
    }
    .tiptap-homework-editor .ProseMirror code {
      background: rgba(0,0,0,0.07);
      border-radius: 3px;
      padding: 1px 4px;
      font-family: monospace;
      font-size: 13px;
    }
    .tiptap-homework-editor .ProseMirror p.is-editor-empty:first-child::before {
      content: attr(data-placeholder);
      color: #aaa;
      pointer-events: none;
      float: left;
      height: 0;
    }
  `;
  document.head.appendChild(style);
}

type TBtnProps = {
  active?: boolean;
  onPress: () => void;
  children: React.ReactNode;
  title: string;
  colors: ReturnType<typeof useColors>;
};

function TBtn({ active, onPress, children, title, colors }: TBtnProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      title={title}
      style={{
        width: 30,
        height: 30,
        borderRadius: 6,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: active ? colors.primary + "22" : "transparent",
        borderWidth: active ? 1 : 0,
        borderColor: active ? colors.primary + "60" : "transparent",
      }}
    >
      {children}
    </TouchableOpacity>
  );
}

export const HomeworkRichEditor = forwardRef<HomeworkRichEditorHandle, Props>(
  ({ initialHtml, expandable = false }, ref) => {
    const colors = useColors();
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [uploading, setUploading] = React.useState(false);

    injectEditorStyles(colors.primary);

    const editor = useEditor({
      extensions: [
        StarterKit,
        TipTapImage.configure({ inline: false, allowBase64: false }),
        Placeholder.configure({ placeholder: "Nhập nội dung bài làm..." }),
      ],
      content: initialHtml || "",
      autofocus: false,
    });

    useImperativeHandle(
      ref,
      () => ({
        getContent: () => editor?.getHTML() ?? "",
      }),
      [editor]
    );

    const handlePickImage = useCallback(() => {
      fileInputRef.current?.click();
    }, []);

    const handleFileChange = useCallback(
      async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        try {
          const uploaded = await apiUpload([
            { uri: URL.createObjectURL(file), name: file.name, mimeType: file.type },
          ]);
          if (uploaded[0]?.url) {
            editor?.chain().focus().setImage({ src: uploaded[0].url }).run();
          }
        } catch {
          // silently ignore on web preview
        } finally {
          setUploading(false);
          if (fileInputRef.current) fileInputRef.current.value = "";
        }
      },
      [editor]
    );

    if (!editor) return null;

    const ic = (name: string, active?: boolean) => (
      <Feather name={name as any} size={13} color={active ? colors.primary : colors.foreground} />
    );

    return (
      <View style={expandable ? { backgroundColor: colors.muted } : { flex: 1, backgroundColor: colors.muted }}>
        {/* Editor canvas */}
        <View
          style={{
            ...(expandable ? {} : { flex: 1 }),
            // @ts-ignore web-only
            overflowY: expandable ? "visible" : "auto",
            backgroundColor: colors.muted,
          }}
        >
          {/* @ts-ignore */}
          <EditorContent
            editor={editor}
            className="tiptap-homework-editor"
            style={{ flex: 1, color: colors.foreground }}
          />
        </View>

        {/* Bottom toolbar */}
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: colors.border,
            backgroundColor: colors.card,
            flexDirection: "row",
            alignItems: "center",
            flexWrap: "wrap",
            paddingHorizontal: 8,
            paddingVertical: 6,
            gap: 2,
          }}
        >
          <TBtn title="Bold" active={editor.isActive("bold")} onPress={() => editor.chain().focus().toggleBold().run()} colors={colors}>
            {ic("bold", editor.isActive("bold"))}
          </TBtn>
          <TBtn title="Italic" active={editor.isActive("italic")} onPress={() => editor.chain().focus().toggleItalic().run()} colors={colors}>
            {ic("italic", editor.isActive("italic"))}
          </TBtn>
          <TBtn title="Strikethrough" active={editor.isActive("strike")} onPress={() => editor.chain().focus().toggleStrike().run()} colors={colors}>
            <Text style={{ fontSize: 12, color: editor.isActive("strike") ? colors.primary : colors.foreground, textDecorationLine: "line-through", fontFamily: "Inter_600SemiBold" }}>S</Text>
          </TBtn>

          <View style={{ width: 1, height: 18, backgroundColor: colors.border, marginHorizontal: 3 }} />

          <TBtn title="Bullet list" active={editor.isActive("bulletList")} onPress={() => editor.chain().focus().toggleBulletList().run()} colors={colors}>
            {ic("list", editor.isActive("bulletList"))}
          </TBtn>
          <TBtn title="Ordered list" active={editor.isActive("orderedList")} onPress={() => editor.chain().focus().toggleOrderedList().run()} colors={colors}>
            <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: editor.isActive("orderedList") ? colors.primary : colors.foreground }}>1.</Text>
          </TBtn>

          <View style={{ width: 1, height: 18, backgroundColor: colors.border, marginHorizontal: 3 }} />

          <TBtn title="Undo" onPress={() => editor.chain().focus().undo().run()} colors={colors}>
            {ic("corner-up-left")}
          </TBtn>
          <TBtn title="Redo" onPress={() => editor.chain().focus().redo().run()} colors={colors}>
            {ic("corner-up-right")}
          </TBtn>

          <View style={{ width: 1, height: 18, backgroundColor: colors.border, marginHorizontal: 3 }} />

          {/* Image insert */}
          <TouchableOpacity
            onPress={handlePickImage}
            disabled={uploading}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 6,
              backgroundColor: colors.primary + "15",
              borderWidth: 1,
              borderColor: colors.primary + "40",
            }}
          >
            {uploading
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <Feather name="image" size={12} color={colors.primary} />}
            <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: colors.primary }}>
              {uploading ? "Đang tải..." : "Chèn ảnh"}
            </Text>
          </TouchableOpacity>

          {/* @ts-ignore */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
        </View>
      </View>
    );
  }
);

HomeworkRichEditor.displayName = "HomeworkRichEditor";
