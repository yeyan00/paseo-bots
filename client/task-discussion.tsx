import { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Pressable,
  Text,
  View,
  type ScrollView as NativeScrollView,
} from "react-native";
import { ScrollView } from "@getpaseo/plugin/client/react-native";
import { useRpc, type PluginScreenProps } from "@getpaseo/plugin/client";
import { SettingsSelect } from "@getpaseo/plugin/client/ui";
import {
  pauseTaskRpc,
  statusRpc,
  type Run,
  type State,
  type Task,
} from "../shared/contracts";
import { CommentComposer } from "./comment-composer";
import { CommentAttachments } from "./comment-attachments";
import { RunDetail } from "./run-detail";
import {
  discussionEntries,
  isActiveRun,
  latestMemberRuns,
} from "./discussion-model";
import { useI18n } from "./i18n";
import { IconAction } from "./icon-action";

function PreviewText({ text, color }: { text: string; color: string }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  text = text.trim();
  const long = text.length > 120 || text.split("\n").length > 4;
  return (
    <View style={{ gap: 4 }}>
      <Text
        selectable
        numberOfLines={long && !expanded ? 4 : undefined}
        style={{ color, fontSize: 14, lineHeight: 21 }}
      >
        {text}
      </Text>
      {long && (
        <Pressable
          accessibilityRole="button"
          onPress={() => setExpanded((value) => !value)}
          style={{ paddingVertical: 6, alignSelf: "flex-start" }}
        >
          <Text style={{ color, fontSize: 12 }}>
            {expanded ? t("收起") : t("展开全文")}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

function RunCard({
  run,
  theme,
  onOpen,
  selected,
}: {
  run: Run;
  theme: PluginScreenProps["theme"];
  onOpen: (id: string) => void;
  selected: boolean;
}) {
  const { t } = useI18n();
  const c = theme.colors;
  const labels: Record<Run["status"], string> = {
    queued: t("排队中"),
    starting: t("启动中"),
    running: t("执行中"),
    permission: t("等待权限"),
    completed: t("回合完成"),
    failed: t("失败"),
    cancelled: t("已停止"),
    paused: t("已暂停"),
    delivery_unknown: t("等待送达确认"),
  };
  const warning =
    ["failed", "permission", "delivery_unknown"].includes(run.status) ||
    (!!run.stopRequested && isActiveRun(run));
  const color = warning
    ? c.statusWarning
    : run.status === "completed"
      ? c.statusSuccess
      : c.foregroundMuted;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("查看 {0} 的执行过程", { 0: run.member.name })}
      onPress={() => onOpen(run.id)}
      style={{
        gap: 7,
        padding: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: selected ? c.accent : c.border,
        backgroundColor: selected ? c.surface2 : c.surface1,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 8,
          alignItems: "center",
        }}
      >
        <View
          style={{
            width: 7,
            height: 7,
            borderRadius: 4,
            backgroundColor: color,
          }}
        />
        <Text style={{ color: c.foreground, fontWeight: "600", fontSize: 13 }}>
          {run.member.name}
        </Text>
        <Text style={{ color, fontSize: 12 }}>
          {run.stopRequested && isActiveRun(run)
            ? t("正在中断")
            : labels[run.status]}
        </Text>
      </View>
      {!!run.previousRunId && (
        <Text style={{ color: c.foregroundMuted, fontSize: 12 }}>
          {t("沿用本任务成员会话")}
        </Text>
      )}
      {!!run.error && (
        <Text style={{ color: c.statusWarning, fontSize: 12 }}>
          {run.error}
        </Text>
      )}
      <Text style={{ color: c.foregroundMuted, fontSize: 12 }}>
        {t("查看执行过程 →")}
      </Text>
    </Pressable>
  );
}

export function TaskDiscussion({
  state,
  task,
  theme,
  layout,
  navigation,
  refresh,
  onBack,
}: {
  state: State;
  task: Task;
  theme: PluginScreenProps["theme"];
  layout: PluginScreenProps["layout"];
  navigation: PluginScreenProps["navigation"];
  refresh: () => Promise<void>;
  onBack: () => void;
}) {
  const { t, locale } = useI18n();
  const c = theme.colors;
  const pause = useRpc(pauseTaskRpc),
    changeStatus = useRpc(statusRpc);
  const [width, setWidth] = useState(0),
    [selectedId, setSelectedId] = useState<string | null>(null);
  const [showMembers, setShowMembers] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [unseen, setUnseen] = useState(false),
    [showInfo, setShowInfo] = useState(false);
  const scroll = useRef<NativeScrollView>(null),
    atBottom = useRef(true);
  const entries = discussionEntries(state, task.id);
  const runs = state.runs.filter((r) => r.taskId === task.id);
  const members = latestMemberRuns(runs);
  const selected = runs.find((r) => r.id === selectedId);
  const wide = width >= 960;
  const overlay = !!selected && !wide;
  const commentCount = state.comments.filter(
    (comment) => comment.taskId === task.id,
  ).length;
  const previousCount = useRef(commentCount);
  useEffect(() => {
    if (commentCount > previousCount.current && !atBottom.current)
      setUnseen(true);
    previousCount.current = commentCount;
  }, [commentCount]);
  async function act(fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("操作失败"));
    } finally {
      setBusy(false);
    }
  }
  const labels = {
    todo: t("待办"),
    in_progress: t("执行中"),
    blocked: t("阻塞"),
    in_review: t("待审核"),
    done: t("已完成"),
  };
  function button(label: string, onPress: () => void, disabled = busy) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={disabled}
        onPress={onPress}
        style={{
          paddingHorizontal: 10,
          paddingVertical: 8,
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
    <KeyboardAvoidingView
      behavior={layout.platform === "ios" ? "padding" : undefined}
      style={{ flex: 1, minHeight: 0 }}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      <View
        style={{
          flex: 1,
          minHeight: 0,
          flexDirection: "row",
          position: "relative",
        }}
      >
        <View
          style={{ flex: 1, minWidth: 0, zIndex: 0 }}
          pointerEvents={overlay ? "none" : "auto"}
          accessibilityElementsHidden={overlay}
          aria-hidden={overlay}
          importantForAccessibility={overlay ? "no-hide-descendants" : "auto"}
        >
          <View
            style={{
              padding: 12,
              gap: 8,
              borderBottomWidth: 1,
              borderColor: c.border,
              // The header owns its tooltip layer above the scrolling discussion.
              zIndex: 2,
              overflow: "visible",
              backgroundColor: c.surface0,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                zIndex: 2,
              }}
            >
              <IconAction
                icon="ArrowLeft"
                label={t("返回看板")}
                theme={theme}
                onPress={onBack}
                align="start"
              />
              <Text
                numberOfLines={2}
                style={{
                  color: c.foreground,
                  fontSize: 16,
                  fontWeight: "600",
                  flex: 1,
                }}
              >
                {task.title}
              </Text>
              <IconAction
                icon="Info"
                label={t("任务详情")}
                theme={theme}
                expanded={showInfo}
                onPress={() => {
                  setShowInfo((value) => !value);
                  setShowMembers(false);
                }}
              />
            </View>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 4,
                zIndex: 1,
              }}
            >
              <Text style={{ color: c.foregroundMuted, fontSize: 12, flex: 1 }}>
                {task.controlState === "pausing"
                  ? t("暂停中")
                  : task.controlState === "paused"
                    ? t("已暂停")
                    : labels[task.status]}
              </Text>
              <IconAction
                icon="Users"
                count={members.length}
                label={t("{0} 位成员 · {1} 个活跃执行", {
                  0: members.length,
                  1: runs.filter(isActiveRun).length,
                })}
                theme={theme}
                expanded={showMembers}
                onPress={() => {
                  setShowMembers((value) => !value);
                  setShowInfo(false);
                }}
              />
              <Text style={{ color: c.foregroundMuted, fontSize: 12 }}>
                {t("{0} 个活跃执行", { 0: runs.filter(isActiveRun).length })}
              </Text>
              {!!runs.filter((r) => r.status === "permission").length && (
                <Text style={{ color: c.statusWarning, fontSize: 12 }}>
                  {t("有权限请求待处理")}
                </Text>
              )}
              {task.status !== "done" && !task.controlState && (
                <IconAction
                  icon="Pause"
                  label={t("暂停任务")}
                  theme={theme}
                  disabled={busy}
                  onPress={() => void act(() => pause({ taskId: task.id }))}
                />
              )}
            </View>
            {task.controlState && (
              <Text style={{ color: c.foregroundMuted, fontSize: 12 }}>
                {task.controlState === "pausing"
                  ? t("暂停中：正在等待各节点确认中断。")
                  : t(
                      "已暂停：补充评论后，@选择成员并点击继续。未选择的成员保持暂停。",
                    )}
              </Text>
            )}
            {showInfo && (
              <View style={{ gap: 8, maxHeight: 240 }}>
                <ScrollView contentContainerStyle={{ gap: 8 }}>
                  <PreviewText
                    text={task.description}
                    color={c.foregroundMuted}
                  />
                  <Text style={{ color: c.foregroundMuted, fontSize: 12 }}>
                    {t("项目：")}
                    {state.projects.find((p) => p.id === task.projectId)
                      ?.name ?? t("使用成员默认目录")}
                  </Text>
                  <SettingsSelect
                    label={t("任务状态")}
                    value={task.status}
                    options={Object.entries(labels).map(([value, label]) => ({
                      value: value as Task["status"],
                      label,
                    }))}
                    disabled={busy}
                    onValueChange={(status) =>
                      void act(() => changeStatus({ taskId: task.id, status }))
                    }
                  />
                </ScrollView>
              </View>
            )}
            {showMembers && (
              <ScrollView
                style={{ maxHeight: 180 }}
                contentContainerStyle={{ gap: 6 }}
              >
                {!members.length && (
                  <Text style={{ color: c.foregroundMuted }}>
                    {t("尚未指派成员")}
                  </Text>
                )}
                {members.map((run) => (
                  <RunCard
                    key={run.id}
                    run={run}
                    theme={theme}
                    selected={run.id === selectedId}
                    onOpen={setSelectedId}
                  />
                ))}
              </ScrollView>
            )}
            {!!error && (
              <Text accessibilityRole="alert" style={{ color: c.statusDanger }}>
                {error}
              </Text>
            )}
          </View>
          <ScrollView
            ref={scroll}
            style={{ flex: 1, minHeight: 0 }}
            contentContainerStyle={{ padding: 16, gap: 12 }}
            keyboardShouldPersistTaps="handled"
            scrollEventThrottle={100}
            onScroll={(event) => {
              const { contentOffset, contentSize, layoutMeasurement } =
                event.nativeEvent;
              atBottom.current =
                contentOffset.y + layoutMeasurement.height >=
                contentSize.height - 80;
              if (atBottom.current) setUnseen(false);
            }}
            onContentSizeChange={() => {
              if (atBottom.current)
                scroll.current?.scrollToEnd({ animated: false });
            }}
          >
            {!entries.length && (
              <Text style={{ color: c.foregroundMuted }}>
                {t("开始讨论，或 @成员指派第一项工作。")}
              </Text>
            )}
            {entries.map((entry) =>
              entry.kind === "run" ? (
                <View key={`run:${entry.run.id}`} style={{ marginLeft: 26 }}>
                  <RunCard
                    run={entry.run}
                    theme={theme}
                    selected={entry.run.id === selectedId}
                    onOpen={setSelectedId}
                  />
                </View>
              ) : (
                <View
                  key={entry.comment.id}
                  style={{ flexDirection: "row", gap: 12 }}
                >
                  <View style={{ width: 14, alignItems: "center" }}>
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: entry.comment.runId
                          ? c.statusSuccess
                          : c.foregroundMuted,
                        marginTop: 5,
                      }}
                    />
                    <View
                      style={{
                        width: 1,
                        backgroundColor: c.border,
                        flex: 1,
                        marginTop: 8,
                      }}
                    />
                  </View>
                  <View
                    style={{ flex: 1, minWidth: 0, gap: 8, paddingBottom: 8 }}
                  >
                    <Text style={{ color: c.foregroundMuted, fontSize: 12 }}>
                      {entry.comment.author} ·{" "}
                      {new Date(entry.comment.createdAt).toLocaleString(locale)}
                    </Text>
                    <PreviewText
                      text={entry.comment.body}
                      color={c.foreground}
                    />
                    {!!entry.comment.attachments?.length && (
                      <CommentAttachments
                        items={entry.comment.attachments}
                        theme={theme}
                      />
                    )}
                    {!!entry.comment.memberIds.length && (
                      <Text style={{ color: c.foregroundMuted, fontSize: 12 }}>
                        {entry.comment.memberIds
                          .map(
                            (id) =>
                              `@${state.members.find((m) => m.id === id)?.name ?? id}`,
                          )
                          .join(" ")}
                      </Text>
                    )}
                    {!!entry.comment.runId &&
                      button(
                        t("查看执行过程 →"),
                        () => setSelectedId(entry.comment.runId ?? null),
                        false,
                      )}
                  </View>
                </View>
              ),
            )}
          </ScrollView>
          {unseen && (
            <View style={{ padding: 6, alignItems: "center" }}>
              {button(
                t("有新消息 ↓"),
                () => {
                  atBottom.current = true;
                  setUnseen(false);
                  scroll.current?.scrollToEnd({ animated: true });
                },
                false,
              )}
            </View>
          )}
          <View
            style={{
              padding: 10,
              borderTopWidth: 1,
              borderColor: c.border,
              backgroundColor: c.surface0,
            }}
          >
            <CommentComposer
              key={task.id}
              taskId={task.id}
              state={state}
              theme={theme}
              layout={layout}
              refresh={refresh}
              compact
            />
          </View>
        </View>
        {selected && (
          <View
            style={
              wide
                ? {
                    width: Math.min(480, Math.round(width * 0.42)),
                    borderLeftWidth: 1,
                    borderColor: c.border,
                  }
                : {
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 1,
                    backgroundColor: c.surface0,
                  }
            }
          >
            <RunDetail
              key={selected.id}
              run={selected}
              theme={theme}
              navigation={navigation}
              refresh={refresh}
              onClose={() => setSelectedId(null)}
            />
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
