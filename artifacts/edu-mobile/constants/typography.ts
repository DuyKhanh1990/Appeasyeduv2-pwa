export const fonts = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semiBold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
} as const;

export type FontFamily = (typeof fonts)[keyof typeof fonts];

export const typography = {
  body: {
    fontFamily: fonts.regular,
    fontSize: 14,
  },
  bodyMedium: {
    fontFamily: fonts.medium,
    fontSize: 14,
  },
  label: {
    fontFamily: fonts.medium,
    fontSize: 12,
  },
  button: {
    fontFamily: fonts.semiBold,
    fontSize: 15,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: 20,
  },
  heading: {
    fontFamily: fonts.bold,
    fontSize: 24,
  },
  number: {
    fontFamily: fonts.bold,
    fontSize: 16,
  },
  caption: {
    fontFamily: fonts.regular,
    fontSize: 11,
  },
} as const;
