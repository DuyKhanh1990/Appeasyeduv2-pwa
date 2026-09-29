import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

interface ScheduleItemProps {
  time: string;
  subject: string;
  room: string;
  teacher: string;
  color?: string;
  isNow?: boolean;
}

export function ScheduleItem({ time, subject, room, teacher, color, isNow }: ScheduleItemProps) {
  const colors = useColors();
  const accentColor = color || colors.primary;

  return (
    <View style={[
      styles.container,
      {
        backgroundColor: isNow ? accentColor + "15" : colors.card,
        borderColor: isNow ? accentColor : colors.border,
        borderRadius: colors.radius,
      }
    ]}>
      <View style={[styles.accent, { backgroundColor: accentColor }]} />
      <View style={styles.content}>
        <View style={styles.row}>
          <Text style={[styles.subject, { color: colors.foreground }]}>{subject}</Text>
          {isNow && (
            <View style={[styles.nowBadge, { backgroundColor: accentColor }]}>
              <Text style={styles.nowText}>Đang học</Text>
            </View>
          )}
        </View>
        <Text style={[styles.time, { color: colors.mutedForeground }]}>{time}</Text>
        <Text style={[styles.meta, { color: colors.mutedForeground }]}>{teacher} • {room}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 10,
  },
  accent: {
    width: 4,
  },
  content: {
    flex: 1,
    padding: 12,
    gap: 3,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  subject: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
  },
  time: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  meta: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  nowBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 20,
    marginLeft: 8,
  },
  nowText: {
    color: "#ffffff",
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
  },
});
