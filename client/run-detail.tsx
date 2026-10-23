import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { ScrollView } from "@getpaseo/plugin/client/react-native";
import { useRpc, type PluginScreenProps } from "@getpaseo/plugin/client";
import {
  timelineRpc,
  permissionRpc,
  stopRpc,
  type Run,
} from "../shared/contracts";
import { EventRow } from "./event-row";
import { useI18n } from "./i18n";
import { isActiveRun } from "./discussion-model";

export function RunDetail({
  run,
  theme,
  navigation,
  onClose,
  refresh,
}: {
  run: Run;
  theme: PluginScreenProps["theme"];
  navigation: PluginScreenProps["navigation"];
  onClose: () => void;
  refresh: () => Promise<void>;
}) {
  const { t } = useI18n();
  const c = theme.colors;
  const fetch = useRpc(timelineRpc),
    respond = useRpc(permissionRpc),
    stop = useRpc(stopRpc);
  const [rows, setRows] = useState<{ seq: number; item: unknown }[]>([]);
  const [permissions, setPermissions] = useState<
    { id: string; title: string; kind: string; input: unknown }[]
  >([]);
  const [hasOlder, setHasOlder] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const cursor = useRef<{ epoch: string; seq: number } | null>(null);
  const alive = useRef(true);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    alive.current = true;
    let cancelled = false,
      loading = false;
    async function poll() {
      if (loading) return;
      loading = true;
      try {
        const page = await fetch({ runId: run.id });
        if (cancelled) return;
        setLoaded(true);
        setRows((old) =>
          [
            ...new Map(
              [...old, ...page.entries].map((row) => [row.seq, row]),
            ).values(),
          ].sort((a, b) => a.seq - b.seq),
        );
        setPermissions(page.permissions);
        if (!cursor.current) {
          cursor.current = page.startCursor;
          setHasOlder(page.hasOlder);
        }
        setError("");
      } catch {
        if (!cancelled) setError(t("执行记录暂时不可用，正在重试连接。"));
      } finally {
        loading = false;
      }
    }
    void poll();
    const timer = setInterval(() => void poll(), 4000);
    return () => {
      cancelled = true;
      alive.current = false;
      clearInterval(timer);
    };
  }, [run.id, fetch, t]);
  async function act(fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : t("操作失败"));
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  function button(label: string, onPress: () => void, disabled = busy) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        disabled={disabled}
        style={{
          padding: 10,
          borderWidth: 1,
          borderColor: c.border,
          borderRadius: 8,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <Text style={{ color: c.foreground, fontSize: 13 }}>{label}</Text>
      </Pressable>
    );
  }
  return (
    <View style={{ flex: 1, minHeight: 0, backgroundColor: c.surface0 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          padding: 12,
          borderBottomWidth: 1,
          borderColor: c.border,
          gap: 8,
        }}
      >
        <Text style={{ flex: 1, color: c.foreground, fontWeight: "600" }}>
          {t("执行过程 ·")}
          {run.member.name}
        </Text>
        {button(t("返回讨论"), onClose, false)}
      </View>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 14 }}
      >
        <Text selectable style={{ color: c.foregroundMuted, fontSize: 12 }}>
          {run.member.cwd}
          {"\n"}
          {run.member.provider}
          {"\n"}
          {run.agentId ?? t("等待创建 Agent")}
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {run.agentId &&
            navigation &&
            button(t("打开原生会话"), () => {
              if (run.agentId)
                navigation.openAgent({
                  agentId: run.agentId,
                  ...(run.member.hostId === "local"
                    ? {}
                    : { serverId: run.member.hostId }),
                });
            })}
          {isActiveRun(run) &&
            button(
              t("停止执行"),
              () => void act(() => stop({ runId: run.id })),
            )}
        </View>
        {!!error && (
          <Text accessibilityRole="alert" style={{ color: c.statusDanger }}>
            {error}
          </Text>
        )}
        {permissions.map((p) => (
          <View
            key={p.id}
            style={{
              gap: 8,
              padding: 12,
              borderWidth: 1,
              borderColor: c.statusWarning,
              borderRadius: 8,
            }}
          >
            <Text style={{ color: c.foreground, fontWeight: "600" }}>
              {t("等待权限")}
            </Text>
            <Text selectable style={{ color: c.foreground }}>
              {p.title}
            </Text>
            <Text selectable style={{ color: c.foregroundMuted, fontSize: 12 }}>
              {JSON.stringify(p.input, null, 2)}
            </Text>
            {p.kind === "tool" ? (
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                {button(
                  t("批准本次请求"),
                  () =>
                    void act(() =>
                      respond({ runId: run.id, requestId: p.id, allow: true }),
                    ),
                )}
                {button(
                  t("拒绝请求"),
                  () =>
                    void act(() =>
                      respond({ runId: run.id, requestId: p.id, allow: false }),
                    ),
                )}
              </View>
            ) : (
              <Text style={{ color: c.foregroundMuted }}>
                {t("请在原生会话中处理此类请求。")}
              </Text>
            )}
          </View>
        ))}
        {hasOlder &&
          button(
            t("加载更早记录"),
            () =>
              void act(async () => {
                if (!cursor.current) return;
                const page = await fetch({
                  runId: run.id,
                  cursor: cursor.current,
                });
                if (!alive.current) return;
                setRows((old) =>
                  [
                    ...new Map(
                      [...page.entries, ...old].map((row) => [row.seq, row]),
                    ).values(),
                  ].sort((a, b) => a.seq - b.seq),
                );
                cursor.current = page.startCursor;
                setHasOlder(page.hasOlder);
              }),
          )}
        {rows.map((row) => (
          <EventRow
            key={row.seq}
            item={row.item}
            foreground={c.foreground}
            muted={c.foregroundMuted}
          />
        ))}
        {!loaded && !error && (
          <Text style={{ color: c.foregroundMuted }}>{t("正在读取会话…")}</Text>
        )}
        {loaded && !rows.length && !error && (
          <Text style={{ color: c.foregroundMuted }}>
            {t("暂无可读取的会话消息。")}
          </Text>
        )}
        <Text style={{ color: c.foreground, fontWeight: "600" }}>
          {t("已保存的执行结果")}
        </Text>
        <Text selectable style={{ color: c.foreground }}>
          {run.result || run.error || t("尚无结果。")}
        </Text>
      </ScrollView>
    </View>
  );
}
