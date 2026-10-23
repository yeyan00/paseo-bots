import { useI18n } from "./i18n";
import { useRef, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { Modal } from "@getpaseo/plugin/client/react-native";
import { useRpc, type PluginScreenProps } from "@getpaseo/plugin/client";
import { readAttachmentRpc, type Attachment } from "../shared/contracts";
export function CommentAttachments({
  items,
  theme,
}: {
  items: Attachment[];
  theme: PluginScreenProps["theme"];
}) {
  const { t } = useI18n();

  const read = useRpc(readAttachmentRpc);
  const request = useRef(0);
  const [selected, setSelected] = useState<Attachment | null>(null),
    [data, setData] = useState(""),
    [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      {items.map((f) => (
        <Pressable
          key={f.id}
          accessibilityRole="button"
          onPress={() => {
            const token = ++request.current;
            setSelected(f);
            setData("");
            setError("");
            setLoading(true);
            void read({ id: f.id })
              .then((r) => {
                if (token === request.current) setData(r.base64);
              })
              .catch(() => {
                if (token === request.current)
                  setError(t("附件读取失败，请关闭后重试"));
              })
              .finally(() => {
                if (token === request.current) setLoading(false);
              });
          }}
          style={{
            padding: 10,
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: 8,
          }}
        >
          <Text style={{ color: theme.colors.foreground }}>
            📎 {f.fileName} · {Math.ceil(f.size / 1024)} KB
          </Text>
        </Pressable>
      ))}
      <Modal
        title={selected?.fileName ?? t("附件")}
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) {
            request.current++;
            setSelected(null);
            setData("");
          }
        }}
      >
        <Modal.Content>
          {loading && (
            <Text style={{ color: theme.colors.foregroundMuted }}>
              {t("正在读取附件…")}
            </Text>
          )}
          {!!error && (
            <Text style={{ color: theme.colors.foreground }}>{error}</Text>
          )}
          {selected &&
            !!data &&
            (selected?.mimeType.startsWith("image/") ? (
              <Image
                accessibilityLabel={selected.fileName}
                source={{ uri: `data:${selected.mimeType};base64,${data}` }}
                resizeMode="contain"
                style={{ width: "100%", height: 360 }}
              />
            ) : (
              <Text selectable style={{ color: theme.colors.foreground }}>
                {decodeURIComponent(
                  Array.from(
                    atob(data),
                    (char) =>
                      `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`,
                  ).join(""),
                )}
              </Text>
            ))}
        </Modal.Content>
      </Modal>
    </View>
  );
}
