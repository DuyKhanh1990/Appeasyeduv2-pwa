import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { useColors } from "@/hooks/useColors";

interface HomeworkItemProps {
  subject: string;
  title: string;
  dueDate: string;
  isDone: boolean;
  isOverdue?: boolean;
  onToggle: () => void;
}

export function HomeworkItem({ subject, title, dueDate, isDone, isOverdue, onToggle }: HomeworkItemProps) {
  const colors = useColors();

  const borderColor = isDone ? colors.success : isOverdue ? colors.destructive : colors.border;
  const labelBg = isDone ? colors.success + "20" : isOverdue ? colors.destructive + "20" : colors.secondary;
  const labelColor = isDone ? colors.success : isOverdue ? colors.destructive : colors.primary;

  return (
    <View style={[styles.container, { backgroundColor: colors.card, borderColor, borderRadius: colors.radius }]}>
      <TouchableOpacity onPress={onToggle} style={[styles.checkbox, { borderColor: isDone ? colors.success : colors.border, backgroundColor: isDone ? colors.success : "transparent" }]}>
        {isDone && <Feather name="check" size={12} color="#fff" />}
      </TouchableOpacity>
      <View style={styles.content}>
        <View style={[styles.tag, { backgroundColor: labelBg }]}>
          <Text style={[styles.tagText, { color: labelColor }]}>{subject}</Text>
        </View>
        <Text style={[styles.title, { color: colors.foreground, textDecorationLine: isDone ? "line-through" : "none" }]}>{title}</Text>
        <Text style={[styles.due, { color: isOverdue ? colors.destructive : colors.mutedForeground }]}>
          Hạn: {dueDate}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
    gap: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  content: {
    flex: 1,
    gap: 4,
  },
  tag: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 20,
  },
  tagText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  title: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  due: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
});
