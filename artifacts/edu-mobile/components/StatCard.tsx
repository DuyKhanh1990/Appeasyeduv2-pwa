import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  color?: string;
}

export function StatCard({ icon, label, value, color }: StatCardProps) {
  const colors = useColors();

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
      <View style={[styles.iconContainer, { backgroundColor: color ? color + "20" : colors.secondary }]}>
        {icon}
      </View>
      <Text style={[styles.value, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.label, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    gap: 6,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  value: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
  },
  label: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
});
