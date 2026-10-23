import { useI18n } from "./i18n";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

export function EventRow({
  item,
  foreground,
  muted,
}: {
  item: unknown;
  foreground: string;
  muted: string;
}) {
  const { t } = useI18n();

  const [expanded, setExpanded] = useState(false);
  const row =
    item && typeof item === "object" ? (item as Record<string, unknown>) : {};
  const detail =
    row.detail && typeof row.detail === "object"
      ? (row.detail as Record<string, unknown>)
      : {};
  const labels: Record<string, string> = {
    user_message: t("执行指令"),
    assistant_message: "Agent",
    tool_call: t("工具调用"),
    reasoning: t("推理摘要"),
  };
  const type = String(row.type ?? "event");
  const title = `${labels[type] ?? type}${row.status ? ` · ${row.status}` : ""}${row.name ? ` · ${row.name}` : ""}`;
  const text =
    typeof row.text === "string"
      ? row.text
      : typeof detail.command === "string"
        ? [
            detail.cwd,
            detail.command,
            detail.output,
            detail.exitCode !== undefined
              ? t("退出码：{0}", { 0: String(detail.exitCode) })
              : "",
          ]
            .filter((x) => x !== undefined)
            .join("\n")
        : typeof detail.filePath === "string"
          ? [detail.filePath, detail.newString ?? detail.diff ?? detail.output]
              .filter((x) => x !== undefined)
              .join("\n")
          : JSON.stringify(item, null, 2);
  return (
    <View
      style={{
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderColor: muted,
        gap: 5,
      }}
    >
      <Text style={{ color: muted, fontSize: 12, fontWeight: "700" }}>
        {title}
      </Text>
      <Text
        selectable
        numberOfLines={expanded ? undefined : type === "user_message" ? 3 : 8}
        style={{ color: foreground, fontSize: 13 }}
      >
        {text}
      </Text>
      {(text.length > 240 || text.split("\n").length > 8) && (
        <Pressable
          accessibilityRole="button"
          onPress={() => setExpanded(!expanded)}
          style={{ paddingVertical: 6 }}
        >
          <Text style={{ color: muted, fontSize: 12 }}>
            {expanded ? t("收起") : t("展开详情")}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
