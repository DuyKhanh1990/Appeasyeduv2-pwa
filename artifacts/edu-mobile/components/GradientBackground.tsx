import React from "react";
import { StyleSheet, View, ViewStyle } from "react-native";

import { useColors } from "@/hooks/useColors";

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
  type?: "primary" | "card" | "subtle";
}

export function GradientBackground({ children, style, type = "primary" }: Props) {
  const colors = useColors();

  if (type === "card") {
    return (
      <View
        style={[styles.container, style, { backgroundColor: colors.card }]}
      >
        {children}
      </View>
    );
  }

  if (type === "subtle") {
    return (
      <View
        style={[styles.container, style, { backgroundColor: colors.secondary }]}
      >
        {children}
      </View>
    );
  }

  return (
    <View
      style={[styles.container, style, { backgroundColor: colors.gradientStart }]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
