import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

interface ChatMessageProps {
  sender: string;
  message: string;
  time: string;
  isMe?: boolean;
  avatar?: string;
}

export function ChatMessage({ sender, message, time, isMe }: ChatMessageProps) {
  const colors = useColors();

  return (
    <View style={[styles.container, isMe && styles.containerMe]}>
      {!isMe && (
        <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
          <Text style={styles.avatarText}>{sender[0]}</Text>
        </View>
      )}
      <View style={styles.bubble_wrap}>
        {!isMe && <Text style={[styles.sender, { color: colors.mutedForeground }]}>{sender}</Text>}
        <View style={[
          styles.bubble,
          {
            backgroundColor: isMe ? colors.primary : colors.card,
            borderColor: colors.border,
            borderRadius: colors.radius,
          }
        ]}>
          <Text style={[styles.text, { color: isMe ? colors.primaryForeground : colors.foreground }]}>{message}</Text>
        </View>
        <Text style={[styles.time, { color: colors.mutedForeground }]}>{time}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginBottom: 12,
    gap: 8,
  },
  containerMe: {
    justifyContent: "flex-end",
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#ffffff",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  bubble_wrap: {
    maxWidth: "75%",
    gap: 3,
  },
  sender: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    marginLeft: 4,
  },
  bubble: {
    padding: 10,
    borderWidth: 1,
  },
  text: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
  time: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    marginLeft: 4,
  },
});
