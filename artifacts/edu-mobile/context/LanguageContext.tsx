import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";

import { translate } from "@/i18n/translations";

export type Language = "vi" | "en";

interface LanguageContextValue {
  language: Language;
  setLanguage: (language: Language) => Promise<void>;
  t: (sourceText: string) => string;
  locale: "vi-VN" | "en-US";
}

const STORAGE_KEY = "app_lang";
const LanguageContext = createContext<LanguageContextValue | null>(null);

async function readSavedLanguage(): Promise<Language> {
  try {
    const stored =
      Platform.OS === "web"
        ? typeof window !== "undefined"
          ? window.localStorage.getItem(STORAGE_KEY)
          : null
        : await AsyncStorage.getItem(STORAGE_KEY);
    return stored === "en" ? "en" : "vi";
  } catch (error) {
    console.warn("[language] Could not read saved language:", error);
    return "vi";
  }
}

async function persistLanguage(language: Language): Promise<void> {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, language);
    }
    return;
  }
  await AsyncStorage.setItem(STORAGE_KEY, language);
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>("vi");
  const hasExplicitSelection = useRef(false);

  useEffect(() => {
    let active = true;
    void readSavedLanguage().then((savedLanguage) => {
      if (active && !hasExplicitSelection.current) setLanguageState(savedLanguage);
    });
    return () => {
      active = false;
    };
  }, []);

  const setLanguage = useCallback(async (nextLanguage: Language) => {
    hasExplicitSelection.current = true;
    setLanguageState(nextLanguage);
    try {
      await persistLanguage(nextLanguage);
    } catch (error) {
      console.warn("[language] Could not save language:", error);
    }
  }, []);

  useEffect(() => {
    if (Platform.OS === "web" && typeof document !== "undefined") {
      document.documentElement.lang = language;
    }
  }, [language]);

  const t = useCallback(
    (sourceText: string) => (language === "en" ? translate(sourceText) : sourceText),
    [language],
  );

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      t,
      locale: language === "en" ? ("en-US" as const) : ("vi-VN" as const),
    }),
    [language, setLanguage, t],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}