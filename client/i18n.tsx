import { createContext, useContext, useMemo, type ReactNode } from "react";
import { Text, View } from "react-native";
import { useSettings, type PluginScreenProps } from "@getpaseo/plugin/client";
import { SettingsSelect } from "@getpaseo/plugin/client/ui";
import { preferences } from "../shared/preferences";
import { resolveLanguage, translate, type MessageKey } from "./translations";
const Context = createContext({
  t: (key: MessageKey, values?: Record<string, string | number>) =>
    translate("en", key, values),
  locale: "en" as string,
});
export function useI18n() {
  return useContext(Context);
}
export function LanguageProvider({
  theme,
  children,
}: {
  theme: PluginScreenProps["theme"];
  children: ReactNode;
}) {
  const settings = useSettings(preferences);
  const systemLocale = Intl.DateTimeFormat().resolvedOptions().locale;
  const language = resolveLanguage(
    settings.status === "ready" ? settings.values.language : "system",
    systemLocale,
  );
  const value = useMemo(
    () => ({
      t: (key: MessageKey, values?: Record<string, string | number>) =>
        translate(language, key, values),
      locale: language,
    }),
    [language],
  );
  return (
    <Context.Provider value={value}>
      <View style={{ flex: 1 }}>
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          <SettingsSelect
            label="Language / 语言"
            value={
              settings.status === "ready" ? settings.values.language : "system"
            }
            options={[
              { value: "system", label: "System / 跟随系统" },
              { value: "en", label: "English" },
              { value: "zh-CN", label: "简体中文" },
            ]}
            disabled={settings.status !== "ready" || settings.saving}
            onValueChange={(language) => {
              if (settings.status === "ready")
                void settings.save({ language }, settings.revision);
            }}
          />
        </View>
        {settings.status !== "loading" && settings.status !== "ready" && (
          <Text style={{ color: theme.colors.foreground }}>
            Language settings unavailable: {settings.error}
          </Text>
        )}
        {settings.status === "ready" && !!settings.saveError && (
          <Text style={{ color: theme.colors.foreground }}>
            {settings.saveError}
          </Text>
        )}
        {children}
      </View>
    </Context.Provider>
  );
}
