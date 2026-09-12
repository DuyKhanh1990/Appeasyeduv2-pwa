/**
 * CommentRichEditor — Web variant (Expo Web / browser).
 *
 * Dùng TipTap React trực tiếp — không cần WebView.
 * Output HTML tương thích 100% với web TipTap editor và native tentap-editor
 * (cùng base Prosemirror).
 *
 * Metro bundler tự động dùng file này thay cho CommentRichEditor.tsx khi build web.
 */
import { Feather } from "@expo/vector-icons";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import React, { useCallback, useRef } from "react";
import {
  ActivityIndicator,
  Platform,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { apiUpload } from "@/lib/api";

interface Props {
  student?: { fullName: string; code: string };
  initialHtml: string;
  onSave: (html: string) => void;
  onDelete: () => void;
  onClose: () => void;
}

// Inject minimal ProseMirror + toolbar CSS into <head> once
function injectEditorStyles(primaryColor: string) {
  const id = "tiptap-comment-styles";
  if (typeof document === "undefined" || document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = `
    .tiptap-comment-editor .ProseMirror {
      outline: none;
      min-height: 180px;
      font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
      font-size: 15px;
      line-height: 1.6;
      padding: 12px 14px;
      color: inherit;
    }
    .tiptap-comment-editor .ProseMirror p { margin: 0 0 8px 0; }
    .tiptap-comment-editor .ProseMirror p:last-child { margin-bottom: 0; }
    .tiptap-comment-editor .ProseMirror ul,
    .tiptap-comment-editor .ProseMirror ol { padding-left: 20px; margin: 0 0 8px 0; }
    .tiptap-comment-editor .ProseMirror li { margin-bottom: 2px; }
    .tiptap-comment-editor .ProseMirror strong { font-weight: 700; }
    .tiptap-comment-editor .ProseMirror em { font-style: italic; }
    .tiptap-comment-editor .ProseMirror h1 { font-size: 22px; font-weight: 700; margin: 0 0 8px 0; }
    .tiptap-comment-editor .ProseMirror h2 { font-size: 18px; font-weight: 700; margin: 0 0 8px 0; }
    .tiptap-comment-editor .ProseMirror h3 { font-size: 15px; font-weight: 700; margin: 0 0 8px 0; }
    .tiptap-comment-editor .ProseMirror img { max-width: 100%; border-radius: 6px; margin: 4px 0; }
    .tiptap-comment-editor .ProseMirror blockquote {
      border-left: 3px solid ${primaryColor};
      margin: 0 0 8px 0;
      padding-left: 12px;
      color: #888;
    }
    .tiptap-comment-editor .ProseMirror code {
      background: rgba(0,0,0,0.07);
      border-radius: 3px;
      padding: 1px 4px;
      font-family: monospace;
      font-size: 13px;
    }
    .tiptap-comment-editor .ProseMirror p.is-editor-empty:first-child::before {
      content: attr(data-placeholder);
      color: #aaa;
      pointer-events: none;
      float: left;
      height: 0;
    }
  `;
  document.head.appendChild(style);
}

type ToolbarButtonProps = {
  active?: boolean;
  onPress: () => void;
  children: React.ReactNode;
  title: string;
  colors: ReturnType<typeof useColors>;
};

function ToolbarBtn({ active, onPress, children, title, colors }: ToolbarButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      title={title}
      style={{
        width: 32,
        height: 32,
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

export function CommentRichEditor({ student, initialHtml, onSave, onDelete, onClose }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = React.useState(false);

  injectEditorStyles(colors.primary);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({ inline: false, allowBase64: false }),
    ],
    content: initialHtml || "",
    autofocus: true,
  });

  const handleSave = useCallback(() => {
    const html = editor?.getHTML() ?? initialHtml ?? "";
    onSave(html);
    onClose();
  }, [editor, initialHtml, onSave, onClose]);

  const handleDelete = useCallback(() => {
    onDelete();
    onClose();
  }, [onDelete, onClose]);

  const handlePickImage = useCallback(() => {
    // Trigger hidden file input
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setUploading(true);
      try {
        const uploaded = await apiUpload([
          {
            uri: URL.createObjectURL(file),
            name: file.name,
            mimeType: file.type,
          },
        ]);
        if (uploaded[0]?.url) {
          editor?.chain().focus().setImage({ src: uploaded[0].url }).run();
        }
      } catch {
        // silently ignore on web preview
      } finally {
        setUploading(false);
        // Reset so same file can be picked again
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [editor]
  );

  if (!editor) return null;

  const ic = (name: string, active?: boolean) => (
    <Feather name={name as any} size={14} color={active ? colors.primary : colors.foreground} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* ── Header ── */}
      <View
        style={{
          paddingTop: (Platform.OS === "web" ? 0 : insets.top) + 12,
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

      {/* ── Editor area ── */}
      <View
        style={{
          flex: 1,
          overflow: "hidden",
          // @ts-ignore — web-only scroll
          overflowY: "auto",
          backgroundColor: colors.background,
        }}
      >
        {/* @ts-ignore — EditorContent renders a DOM div, valid in Expo Web */}
        <EditorContent
          editor={editor}
          className="tiptap-comment-editor"
          style={{ flex: 1, color: colors.foreground }}
        />
      </View>

      {/* ── Bottom toolbar + actions ── */}
      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: colors.border,
          backgroundColor: colors.card,
        }}
      >
        {/* Formatting toolbar */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            flexWrap: "wrap",
            paddingHorizontal: 8,
            paddingVertical: 6,
            gap: 2,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        >
          <ToolbarBtn title="Bold" active={editor.isActive("bold")} onPress={() => editor.chain().focus().toggleBold().run()} colors={colors}>
            {ic("bold", editor.isActive("bold"))}
          </ToolbarBtn>
          <ToolbarBtn title="Italic" active={editor.isActive("italic")} onPress={() => editor.chain().focus().toggleItalic().run()} colors={colors}>
            {ic("italic", editor.isActive("italic"))}
          </ToolbarBtn>
          <ToolbarBtn title="Strikethrough" active={editor.isActive("strike")} onPress={() => editor.chain().focus().toggleStrike().run()} colors={colors}>
            <Text style={{ fontSize: 13, color: editor.isActive("strike") ? colors.primary : colors.foreground, textDecorationLine: "line-through", fontFamily: "Inter_600SemiBold" }}>S</Text>
          </ToolbarBtn>

          {/* Divider */}
          <View style={{ width: 1, height: 20, backgroundColor: colors.border, marginHorizontal: 4 }} />

          <ToolbarBtn title="H1" active={editor.isActive("heading", { level: 1 })} onPress={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} colors={colors}>
            <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: editor.isActive("heading", { level: 1 }) ? colors.primary : colors.foreground }}>H1</Text>
          </ToolbarBtn>
          <ToolbarBtn title="H2" active={editor.isActive("heading", { level: 2 })} onPress={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} colors={colors}>
            <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: editor.isActive("heading", { level: 2 }) ? colors.primary : colors.foreground }}>H2</Text>
          </ToolbarBtn>

          {/* Divider */}
          <View style={{ width: 1, height: 20, backgroundColor: colors.border, marginHorizontal: 4 }} />

          <ToolbarBtn title="Bullet list" active={editor.isActive("bulletList")} onPress={() => editor.chain().focus().toggleBulletList().run()} colors={colors}>
            {ic("list", editor.isActive("bulletList"))}
          </ToolbarBtn>
          <ToolbarBtn title="Ordered list" active={editor.isActive("orderedList")} onPress={() => editor.chain().focus().toggleOrderedList().run()} colors={colors}>
            <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: editor.isActive("orderedList") ? colors.primary : colors.foreground }}>1.</Text>
          </ToolbarBtn>
          <ToolbarBtn title="Blockquote" active={editor.isActive("blockquote")} onPress={() => editor.chain().focus().toggleBlockquote().run()} colors={colors}>
            {ic("message-square", editor.isActive("blockquote"))}
          </ToolbarBtn>

          {/* Divider */}
          <View style={{ width: 1, height: 20, backgroundColor: colors.border, marginHorizontal: 4 }} />

          <ToolbarBtn title="Undo" onPress={() => editor.chain().focus().undo().run()} colors={colors}>
            {ic("corner-up-left")}
          </ToolbarBtn>
          <ToolbarBtn title="Redo" onPress={() => editor.chain().focus().redo().run()} colors={colors}>
            {ic("corner-up-right")}
          </ToolbarBtn>

          {/* Divider */}
          <View style={{ width: 1, height: 20, backgroundColor: colors.border, marginHorizontal: 4 }} />

          {/* Image insert */}
          <TouchableOpacity
            onPress={handlePickImage}
            disabled={uploading}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 6,
              backgroundColor: colors.primary + "15",
              borderWidth: 1,
              borderColor: colors.primary + "40",
            }}
          >
            {uploading
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <Feather name="image" size={13} color={colors.primary} />}
            <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: colors.primary }}>
              {uploading ? "Đang tải..." : "Chèn ảnh"}
            </Text>
          </TouchableOpacity>

          {/* Hidden file input for image upload */}
          {/* @ts-ignore */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
        </View>

        {/* Save / Delete buttons */}
        <View
          style={{
            flexDirection: "row",
            gap: 10,
            paddingHorizontal: 16,
            paddingVertical: 12,
          }}
        >
          <TouchableOpacity
            onPress={handleDelete}
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
