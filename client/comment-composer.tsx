import { useI18n } from "./i18n";
import { useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import {
  Modal,
  ScrollView,
  TextInput,
} from "@getpaseo/plugin/client/react-native";
import { useRpc, type PluginScreenProps } from "@getpaseo/plugin/client";
import {
  commentRpc,
  uploadAttachmentRpc,
  type State,
  type Attachment,
} from "../shared/contracts";

export function CommentComposer({
  taskId,
  state,
  theme,
  layout,
  refresh,
  compact = false,
}: {
  compact?: boolean;
  taskId: string;
  state: State;
  theme: PluginScreenProps["theme"];
  layout: PluginScreenProps["layout"];
  refresh: () => Promise<void>;
}) {
  const { t } = useI18n();

  const post = useRpc(commentRpc),
    upload = useRpc(uploadAttachmentRpc);
  const [body, setBody] = useState("");
  const [members, setMembers] = useState<string[]>([]);
  const [files, setFiles] = useState<Attachment[]>([]);
  const [picker, setPicker] = useState(false),
    [query, setQuery] = useState("");
  const [textFile, setTextFile] = useState(false),
    [fileName, setFileName] = useState(t("说明.md")),
    [fileText, setFileText] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef<{ key: string; id: string } | null>(null);
  const c = theme.colors;
  const controlState = state.tasks.find((t) => t.id === taskId)?.controlState;
  const sendingBlocked =
    busy ||
    (!body.trim() && !files.length) ||
    (members.length > 0 && controlState === "pausing");
  const action = (label: string, onPress: () => void, disabled = busy) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      style={{ padding: 10, opacity: disabled ? 0.4 : 1 }}
    >
      <Text style={{ color: c.foreground, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
  async function addFile(name: string, base64: string) {
    if (files.length >= 4) throw new Error(t("每条评论最多 4 个附件"));
    const item = await upload({ fileName: name, base64 });
    setFiles((old) =>
      old.some((f) => f.id === item.id) ? old : [...old, item],
    );
  }
  async function operation(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  function chooseFile() {
    // The plugin SDK currently exposes no native device file picker.
    if (layout.platform !== "web") {
      setTextFile(true);
      return;
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept =
      ".txt,.md,.json,.csv,.log,.yaml,.yml,.png,.jpg,.jpeg,.webp,.gif";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      void operation(async () => {
        if (file.size > 512 * 1024) throw new Error(t("单个附件最大 512 KB"));
        const base64 = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onerror = () => reject(new Error(t("读取文件失败")));
          r.onload = () => resolve(String(r.result).split(",")[1]);
          r.readAsDataURL(file);
        });
        await addFile(file.name, base64);
      });
    };
    input.click();
  }
  return (
    <View style={{ gap: 8 }}>
      <View
        style={{
          borderWidth: 1,
          borderColor: c.border,
          borderRadius: 12,
          backgroundColor: c.surface1,
          padding: 8,
          gap: 8,
        }}
      >
        <TextInput
          accessibilityLabel={t("评论内容")}
          placeholder={t("发表评论，或选择成员并输入具体指令…")}
          placeholderTextColor={c.foregroundMuted}
          value={body}
          onChangeText={setBody}
          editable={!busy}
          multiline
          style={{
            color: c.foreground,
            minHeight: compact ? 48 : 96,
            maxHeight: compact ? 110 : 240,
            padding: 8,
            textAlignVertical: "top",
          }}
        />
        {!!members.length && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
            {members.map((id) => (
              <View
                key={id}
                style={{ backgroundColor: c.surface2, borderRadius: 8 }}
              >
                {action(
                  `@${state.members.find((m) => m.id === id)?.name ?? id} ×`,
                  () => setMembers((old) => old.filter((m) => m !== id)),
                )}
              </View>
            ))}
          </View>
        )}
        {files.map((f) => (
          <View
            key={f.id}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text style={{ color: c.foreground, fontSize: 12, flex: 1 }}>
              {f.fileName} · {Math.ceil(f.size / 1024)} KB
            </Text>
            {action(t("移除 {0}", { 0: f.fileName }), () =>
              setFiles((old) => old.filter((x) => x.id !== f.id)),
            )}
          </View>
        ))}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 4,
          }}
        >
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {action(t("@ 选择成员"), () => {
              setQuery("");
              setPicker(true);
            })}
            {action(t("＋ 附件"), chooseFile, busy || files.length >= 4)}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              members.length && controlState === "paused"
                ? t("继续运行并发送")
                : members.length
                  ? t("发送评论并派发")
                  : t("发送评论")
            }
            disabled={sendingBlocked}
            onPress={() => {
              void operation(async () => {
                const key = JSON.stringify([
                  taskId,
                  body,
                  members,
                  files,
                  controlState,
                ]);
                if (pending.current?.key !== key)
                  pending.current = {
                    key,
                    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                  };
                await post({
                  taskId,
                  requestId: pending.current.id,
                  body,
                  memberIds: members,
                  attachments: files,
                  resumeTask: members.length > 0 && controlState === "paused",
                });
                pending.current = null;
                setBody("");
                setMembers([]);
                setFiles([]);
                await refresh();
              });
            }}
            style={{
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderRadius: 8,
              backgroundColor: c.surface2,
              opacity: sendingBlocked ? 0.4 : 1,
            }}
          >
            <Text style={{ color: c.foreground }}>
              {busy
                ? t("处理中…")
                : members.length && controlState === "paused"
                  ? t("继续并发送 ↑")
                  : t("发送 ↑")}
            </Text>
          </Pressable>
        </View>
      </View>
      {!compact && (
        <Text style={{ color: c.foregroundMuted, fontSize: 12 }}>
          {members.length
            ? t(
                "发送给 {0} 位成员：自动继续本任务会话，首次指派自动创建；执行中的补充按顺序排队。",
                {
                  0: members.length,
                },
              )
            : t("不选择成员时仅发表评论。")}{" "}
          {t("附件最多 4 个，单个 512 KB。")}
        </Text>
      )}
      {layout.platform !== "web" && (
        <Text style={{ color: c.foregroundMuted, fontSize: 12 }}>
          {t(
            "手机端可粘贴内容添加文本附件；设备文件和图片选择需补充 Paseo 插件 SDK 支持。",
          )}
        </Text>
      )}
      {!!error && (
        <Text accessibilityRole="alert" style={{ color: c.foreground }}>
          {error}
        </Text>
      )}
      <Modal title={t("选择执行成员")} open={picker} onOpenChange={setPicker}>
        <Modal.Content>
          <TextInput
            accessibilityLabel={t("搜索成员")}
            placeholder={t("搜索名称、Host、Runtime")}
            placeholderTextColor={c.foregroundMuted}
            value={query}
            onChangeText={setQuery}
            style={{
              color: c.foreground,
              borderWidth: 1,
              borderColor: c.border,
              borderRadius: 8,
              padding: 10,
            }}
          />
          <ScrollView style={{ maxHeight: 360 }}>
            {state.members
              .filter((m) =>
                `${m.name} ${state.hosts.find((h) => h.id === m.hostId)?.name} ${m.provider}`
                  .toLowerCase()
                  .includes(query.toLowerCase()),
              )
              .map((m) => (
                <Pressable
                  key={m.id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: members.includes(m.id) }}
                  onPress={() =>
                    setMembers((old) =>
                      old.includes(m.id)
                        ? old.filter((x) => x !== m.id)
                        : old.length < 8
                          ? [...old, m.id]
                          : old,
                    )
                  }
                  style={{
                    paddingVertical: 12,
                    gap: 4,
                    borderBottomWidth: 1,
                    borderColor: c.border,
                  }}
                >
                  <Text style={{ color: c.foreground }}>
                    {members.includes(m.id) ? "☑" : "☐"} {m.name}
                  </Text>
                  <Text style={{ color: c.foregroundMuted, fontSize: 12 }}>
                    {state.hosts.find((h) => h.id === m.hostId)?.name} ·{" "}
                    {m.provider}
                  </Text>
                  <Text style={{ color: c.foregroundMuted, fontSize: 12 }}>
                    {state.runs.some(
                      (r) => r.taskId === taskId && r.member.id === m.id,
                    )
                      ? t("继续本任务会话")
                      : t("首次指派 · 自动创建会话")}
                  </Text>
                </Pressable>
              ))}
          </ScrollView>
          <Text style={{ color: c.foregroundMuted }}>
            {t("已选 {0}/8 位成员", { 0: members.length })}
          </Text>
          {action(t("完成选择"), () => setPicker(false))}
        </Modal.Content>
      </Modal>
      <Modal
        title={t("添加文本附件")}
        open={textFile}
        onOpenChange={setTextFile}
      >
        <Modal.Content>
          <TextInput
            accessibilityLabel={t("附件文件名")}
            value={fileName}
            onChangeText={setFileName}
            style={{
              color: c.foreground,
              borderWidth: 1,
              borderColor: c.border,
              padding: 10,
            }}
          />
          <TextInput
            accessibilityLabel={t("附件文本")}
            placeholder={t("粘贴 UTF-8 文本或 Markdown")}
            placeholderTextColor={c.foregroundMuted}
            value={fileText}
            onChangeText={setFileText}
            multiline
            style={{
              minHeight: 160,
              color: c.foreground,
              borderWidth: 1,
              borderColor: c.border,
              padding: 10,
              textAlignVertical: "top",
            }}
          />
          {action(
            t("添加到评论"),
            () => {
              void operation(async () => {
                const bytes = encodeURIComponent(fileText).replace(
                  /%([0-9A-F]{2})/g,
                  (_, n: string) => String.fromCharCode(Number.parseInt(n, 16)),
                );
                await addFile(fileName, btoa(bytes));
                setTextFile(false);
                setFileText("");
              });
            },
            busy || !fileText,
          )}
          {!!error && <Text style={{ color: c.foreground }}>{error}</Text>}
        </Modal.Content>
      </Modal>
    </View>
  );
}
