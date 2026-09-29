import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

interface GradeCardProps {
  subject: string;
  grades: { label: string; score: number }[];
  average: number;
}

function getGradeColor(score: number, colors: ReturnType<typeof useColors>) {
  if (score >= 8.5) return colors.success;
  if (score >= 7) return colors.primary;
  if (score >= 5) return colors.warning;
  return colors.destructive;
}

export function GradeCard({ subject, grades, average }: GradeCardProps) {
  const colors = useColors();
  const avgColor = getGradeColor(average, colors);

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
      <View style={styles.header}>
        <Text style={[styles.subject, { color: colors.foreground }]}>{subject}</Text>
        <View style={[styles.avgBadge, { backgroundColor: avgColor + "20" }]}>
          <Text style={[styles.avgValue, { color: avgColor }]}>{average.toFixed(1)}</Text>
        </View>
      </View>
      <View style={styles.gradesRow}>
        {grades.map((g, i) => (
          <View key={i} style={styles.gradeItem}>
            <Text style={[styles.gradeScore, { color: getGradeColor(g.score, colors) }]}>{g.score}</Text>
            <Text style={[styles.gradeLabel, { color: colors.mutedForeground }]}>{g.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  subject: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
  },
  avgBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  avgValue: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  gradesRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  gradeItem: {
    alignItems: "center",
    minWidth: 36,
  },
  gradeScore: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  gradeLabel: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
});
