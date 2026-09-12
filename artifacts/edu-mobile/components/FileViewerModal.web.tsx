import { Feather } from "@expo/vector-icons";
import React from "react";
import { Modal, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface FileViewerModalProps {
  visible: boolean;
  url: string;
  name: string;
  onClose: () => void;
  colors: any;
}

export function FileViewerModal({ visible, url, name, onClose, colors }: FileViewerModalProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{
          flexDirection: "row", alignItems: "center", gap: 10,
          paddingTop: insets.top + 10, paddingBottom: 12,
          paddingHorizontal: 16,
          borderBottomWidth: 1, borderBottomColor: colors.border,
          backgroundColor: colors.card,
        }}>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }}
          >
            <Feather name="x" size={18} color={colors.foreground} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground }} numberOfLines={1}>{name}</Text>
          </View>
          <TouchableOpacity
            onPress={() => window.open(url, "_blank")}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }}
          >
            <Feather name="external-link" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>
        {React.createElement("iframe", {
          src: url,
          style: { flex: 1, border: "none", width: "100%", height: "100%" } as any,
          allow: "fullscreen",
        })}
      </View>
    </Modal>
  );
}
