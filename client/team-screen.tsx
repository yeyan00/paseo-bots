import { useI18n } from "./i18n";
import { LanguageProvider } from "./i18n";
import { useEffect, useState, useCallback, useRef } from "react";
import { Pressable, Text, View } from "react-native";
import {
  ScrollView,
  TextInput,
  Modal,
} from "@getpaseo/plugin/client/react-native";
import { useRpc, type PluginScreenProps } from "@getpaseo/plugin/client";
import { TaskDiscussion } from "./task-discussion";
import { HostProjectPicker } from "./host-project-picker";
import { SettingsSelect } from "@getpaseo/plugin/client/ui";
import {
  projectRpc,
  assignmentSettingsRpc,
  modelsRpc,
  runtimesRpc,
  type Project,
  snapshotRpc,
  createTaskRpc,
  memberRpc,
  hostRpc,
  inspectRpc,
  type State,
  type Member,
} from "../shared/contracts";

const requestId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const initialMember: Member = {
  id: "",
  name: "",
  hostId: "local",
  provider: "opencode",
  cwd: "C:\\test",
  instructions: "",
};

export function TeamScreen(props: PluginScreenProps) {
  return (
    <LanguageProvider key={props.host.id} theme={props.theme}>
      <HostTeam {...props} />
    </LanguageProvider>
  );
}
function HostTeam({ theme, layout, navigation }: PluginScreenProps) {
  const { t, locale } = useI18n();

  const labels = {
    todo: t("待办"),
    in_progress: t("执行中"),
    blocked: t("阻塞"),
    in_review: t("待审核"),
    done: t("已完成"),
  } as const;
  const snapshot = useRpc(snapshotRpc),
    createTask = useRpc(createTaskRpc);
  const saveMember = useRpc(memberRpc),
    saveHost = useRpc(hostRpc);
  const inspect = useRpc(inspectRpc);
  const saveAssignmentSettings = useRpc(assignmentSettingsRpc);
  const saveProject = useRpc(projectRpc),
    loadModels = useRpc(modelsRpc),
    loadRuntimes = useRpc(runtimesRpc);
  const [runtimes, setRuntimes] = useState<
    { provider: string; available: boolean }[]
  >([]);
  const [runtimeError, setRuntimeError] = useState("");
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [tab, setTab] = useState<"board" | "team">("board");
  const [management, setManagement] = useState<
    "members" | "projects" | "hosts" | "settings"
  >("members");
  const [editor, setEditor] = useState<
    "member" | "project" | "host" | "inspect" | null
  >(null);
  const [editingId, setEditingId] = useState("");
  const [projectPending, setProjectPending] = useState<Record<string, boolean>>(
    {},
  );
  const onProjectPending = useCallback(
    (id: string, pending: boolean) =>
      setProjectPending((current) =>
        current[id] === pending ? current : { ...current, [id]: pending },
      ),
    [],
  );
  const [formError, setFormError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState<keyof typeof labels>("todo");
  const [projectId, setProjectId] = useState("");
  const [project, setProject] = useState<Project>({
    id: "",
    name: "",
    paths: {},
  });
  const [models, setModels] = useState<{ id: string; name: string }[]>([]);
  const [title, setTitle] = useState(""),
    [description, setDescription] = useState("");
  const [member, setMember] = useState<Member>(initialMember);
  const [hostName, setHostName] = useState("deeplearning"),
    [hostId, setHostId] = useState("");
  const [pairingUrl, setPairingUrl] = useState("");
  const [providers, setProviders] = useState("");
  const pendingTask = useRef<{ key: string; id: string } | null>(null);
  const mounted = useRef(true);
  const foreground = theme.colors.foreground,
    muted = theme.colors.foregroundMuted;
  const border = theme.colors.border;
  const surface = theme.colors.surface1;
  const statusColors: Record<string, string> = {
    todo: muted,
    in_progress: theme.colors.accent,
    blocked: theme.colors.statusWarning,
    in_review: theme.colors.accent,
    done: theme.colors.statusSuccess,
  };
  useEffect(() => {
    let cancelled = false;
    setModels([]);
    setRuntimes([]);
    setRuntimeError("");
    if (editor === "member")
      void loadRuntimes({ hostId: member.hostId })
        .then((value) => {
          if (!cancelled) setRuntimes(value);
        })
        .catch(() => {
          if (!cancelled)
            setRuntimeError(t("无法查询此 Host 的 Runtime，请检查连接。"));
        });
    return () => {
      cancelled = true;
    };
  }, [editor, member.hostId, loadRuntimes, t]);
  const refresh = useCallback(async () => {
    const next = await snapshot({});
    if (mounted.current) {
      setState(next);
      setError("");
    }
  }, [snapshot]);
  useEffect(() => {
    mounted.current = true;
    let loading = false;
    const poll = async () => {
      if (loading) return;
      loading = true;
      try {
        await refresh();
      } catch {
        if (mounted.current) setError(t("读取任务失败，请检查主 Host 连接。"));
      } finally {
        loading = false;
      }
    };
    void poll();
    const timer = setInterval(() => {
      void poll();
    }, 4000);
    return () => {
      mounted.current = false;
      clearInterval(timer);
    };
  }, [refresh, t]);
  async function act(fn: () => Promise<unknown>, inEditor = !!editor) {
    if (busy) return;
    setBusy(true);
    setError("");
    setFormError("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : t("操作失败");
      if (inEditor) setFormError(message);
      else setError(message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  function button(
    text: string,
    action: () => void,
    active = false,
    label = text,
  ) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={busy}
        onPress={action}
        style={{
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: border,
          backgroundColor: active ? theme.colors.surface2 : "transparent",
          opacity: busy ? 0.5 : 1,
        }}
      >
        <Text
          style={{
            color: foreground,
            fontWeight: active ? "600" : "400",
            fontSize: 14,
          }}
        >
          {text}
        </Text>
      </Pressable>
    );
  }
  function input(
    label: string,
    value: string,
    change: (s: string) => void,
    multiline = false,
    secret = false,
    editable = true,
  ) {
    return (
      <View style={{ gap: 5 }}>
        <Text style={{ color: muted, fontSize: 12 }}>{label}</Text>
        <TextInput
          accessibilityLabel={label}
          value={value}
          editable={editable && !busy}
          onChangeText={change}
          placeholder={label}
          placeholderTextColor={muted}
          multiline={multiline}
          secureTextEntry={secret}
          autoCapitalize="none"
          style={{
            color: foreground,
            padding: 10,
            borderWidth: 1,
            borderColor: muted,
            borderRadius: 8,
            minHeight: multiline ? 80 : 42,
            textAlignVertical: "top",
          }}
        />
      </View>
    );
  }
  function openEditor(
    kind: "member" | "project" | "host" | "inspect",
    id = "",
  ) {
    setFormError("");
    setEditingId(id);
    setModels([]);
    setEditor(kind);
  }
  const task = state?.tasks.find((t) => t.id === taskId);
  if (tab === "board" && state && task)
    return (
      <TaskDiscussion
        key={task.id}
        state={state}
        task={task}
        theme={theme}
        layout={layout}
        navigation={navigation}
        refresh={refresh}
        onBack={() => setTaskId(null)}
      />
    );
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: layout.compact ? 16 : 28, gap: 18 }}
    >
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        {button(
          t("任务看板"),
          () => {
            setTab("board");
            setTaskId(null);
          },
          tab === "board",
        )}
        {button(t("成员列表"), () => setTab("team"), tab === "team")}
      </View>
      {!!error && (
        <Text accessibilityRole="alert" style={{ color: foreground }}>
          {error}
        </Text>
      )}
      {!state && <Text style={{ color: muted }}>{t("正在连接主 Host…")}</Text>}
      {tab === "team" && state && (
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {button(
              t("成员列表"),
              () => setManagement("members"),
              management === "members",
            )}
            {button(
              t("项目与目录"),
              () => setManagement("projects"),
              management === "projects",
            )}
            {button(
              t("执行节点"),
              () => setManagement("hosts"),
              management === "hosts",
            )}
            {button(
              t("设置"),
              () => setManagement("settings"),
              management === "settings",
            )}
          </View>
          {management === "settings" && (
            <View style={{ gap: 12 }}>
              <SettingsSelect
                label={t("每条评论最多指派成员数")}
                value={String(
                  state.assignmentSettings?.maxMembersPerComment ?? 8,
                )}
                options={[0, 1, 2, 4, 8, 16, 32].map((limit) => ({
                  value: String(limit),
                  label: limit === 0 ? t("不限") : String(limit),
                }))}
                disabled={busy}
                onValueChange={(value) =>
                  void act(() =>
                    saveAssignmentSettings({
                      maxMembersPerComment: Number(value),
                    }),
                  )
                }
              />
              <Text style={{ color: muted, fontSize: 12 }}>
                {t(
                  "限制每次评论可指派的成员数量，不影响已提交的执行，也不是并发或排队设置。",
                )}
              </Text>
            </View>
          )}
          {management === "members" && (
            <>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <View style={{ gap: 4 }}>
                  <Text
                    style={{
                      color: foreground,
                      fontSize: 20,
                      fontWeight: "600",
                    }}
                  >
                    {t("团队成员")}
                  </Text>
                  <Text style={{ color: muted, fontSize: 12 }}>
                    {t("{0} 位成员 · {1} 个执行节点", {
                      0: state.members.length,
                      1: state.hosts.length,
                    })}
                  </Text>
                </View>
                {button(t("＋ 添加成员"), () => {
                  setMember(initialMember);
                  openEditor("member");
                })}
              </View>
              {!state.members.length && (
                <Text style={{ color: muted }}>
                  {t("还没有成员，添加成员并选择执行节点与 Runtime。")}
                </Text>
              )}
              {state.members.map((m) => (
                <View
                  key={m.id}
                  style={{
                    padding: 16,
                    borderWidth: 1,
                    borderColor: border,
                    borderRadius: 12,
                    backgroundColor: surface,
                    gap: 8,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                  >
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text
                        style={{
                          color: foreground,
                          fontWeight: "600",
                          fontSize: 15,
                        }}
                      >
                        {m.name}
                      </Text>
                      <Text style={{ color: muted, fontSize: 12 }}>
                        {state.hosts.find((h) => h.id === m.hostId)?.name} ·{" "}
                        {m.provider.split("/")[0]}
                      </Text>
                    </View>
                    {button(
                      t("编辑"),
                      () => {
                        setMember({ ...m });
                        openEditor("member", m.id);
                      },
                      false,
                      t("编辑成员 {0}", { 0: m.name }),
                    )}
                  </View>
                  <Text selectable style={{ color: muted, fontSize: 12 }}>
                    {m.provider}
                  </Text>
                  {!!m.instructions && (
                    <Text
                      numberOfLines={2}
                      style={{
                        color: foreground,
                        fontSize: 13,
                        lineHeight: 19,
                      }}
                    >
                      {m.instructions}
                    </Text>
                  )}
                  <Text
                    numberOfLines={2}
                    style={{ color: muted, fontSize: 12 }}
                  >
                    {t("默认目录：")}
                    {m.cwd}
                  </Text>
                </View>
              ))}
            </>
          )}
          {management === "projects" && (
            <>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  marginTop: 12,
                }}
              >
                <Text
                  style={{ color: foreground, fontWeight: "600", fontSize: 16 }}
                >
                  {t("项目与目录")}
                </Text>
                {button(t("＋ 添加项目"), () => {
                  setProject({ id: "", name: "", paths: {} });
                  openEditor("project");
                })}
              </View>
              {!state.projects.length && (
                <Text style={{ color: muted }}>
                  {t("还没有项目，任务将使用成员的默认目录。")}
                </Text>
              )}
              {state.projects.map((p) => (
                <View
                  key={p.id}
                  style={{
                    padding: 16,
                    borderWidth: 1,
                    borderColor: border,
                    borderRadius: 12,
                    gap: 8,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                  >
                    <Text
                      style={{ color: foreground, flex: 1, fontWeight: "500" }}
                    >
                      {p.name}
                    </Text>
                    {button(
                      t("编辑"),
                      () => {
                        setProject({ ...p, paths: { ...p.paths } });
                        openEditor("project", p.id);
                      },
                      false,
                      t("编辑项目 {0}", { 0: p.name }),
                    )}
                  </View>
                  {Object.entries(p.paths).map(([hostId, path]) => (
                    <Text
                      key={hostId}
                      selectable
                      style={{ color: muted, fontSize: 12 }}
                    >
                      {state.hosts.find((h) => h.id === hostId)?.name ?? hostId}{" "}
                      · {path}
                    </Text>
                  ))}
                </View>
              ))}
            </>
          )}
          {management === "hosts" && (
            <>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  marginTop: 12,
                }}
              >
                <Text
                  style={{ color: foreground, fontWeight: "600", fontSize: 16 }}
                >
                  {t("执行节点")}
                </Text>
                {button(t("＋ 添加节点"), () => {
                  setHostId("");
                  setHostName("");
                  setPairingUrl("");
                  openEditor("host");
                })}
              </View>
              {state.hosts.map((h) => (
                <View
                  key={h.id}
                  style={{
                    paddingVertical: 12,
                    borderBottomWidth: 1,
                    borderColor: border,
                    gap: 8,
                  }}
                >
                  <Text style={{ color: foreground }}>
                    {h.name} · {h.local ? t("本机") : t("远端")}
                  </Text>
                  <View
                    style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
                  >
                    {button(t("检查 {0} 的 Runtime", { 0: h.name }), () => {
                      openEditor("inspect");
                      setProviders("");
                      void act(async () => {
                        setProviders(
                          JSON.stringify(
                            (await inspect({ hostId: h.id })).providers,
                            null,
                            2,
                          ),
                        );
                      }, true);
                    })}
                    {!h.local &&
                      button(t("重新配对 {0}", { 0: h.name }), () => {
                        setHostId(h.id);
                        setHostName(h.name);
                        setPairingUrl("");
                        openEditor("host", h.id);
                      })}
                  </View>
                </View>
              ))}
            </>
          )}
        </>
      )}
      {state && editor && (
        <Modal
          title={
            editor === "inspect"
              ? t("Runtime 检查")
              : t(editingId ? "编辑 {0}" : "添加 {0}", {
                  0: { member: t("成员"), project: t("项目"), host: t("节点") }[
                    editor
                  ],
                })
          }
          open
          onOpenChange={(open) => {
            if (!open && !busy) {
              setEditor(null);
              setPairingUrl("");
            }
          }}
        >
          <Modal.Content>
            {!!formError && (
              <Text
                accessibilityRole="alert"
                style={{ color: theme.colors.statusDanger }}
              >
                {formError}
              </Text>
            )}
            {editor === "member" && (
              <>
                {input(
                  t("成员 ID（英文，如 local-dev）"),
                  member.id,
                  (id) => setMember({ ...member, id }),
                  false,
                  false,
                  !editingId,
                )}
                {input(t("成员名称"), member.name, (name) =>
                  setMember({ ...member, name }),
                )}
                <View
                  style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}
                >
                  {state.hosts.map((h) => (
                    <View key={h.id}>
                      {button(
                        h.name,
                        () => {
                          setMember({ ...member, hostId: h.id });
                          setModels([]);
                        },
                        member.hostId === h.id,
                      )}
                    </View>
                  ))}
                </View>
                {input(
                  t("完整 Runtime/模型标识"),
                  member.provider,
                  (provider) => {
                    setMember({ ...member, provider });
                    setModels([]);
                  },
                )}
                {!!runtimeError && (
                  <Text style={{ color: muted }}>{runtimeError}</Text>
                )}
                <SettingsSelect
                  label={t("执行 Runtime")}
                  value={member.provider.split("/")[0]}
                  options={[
                    ...new Set([
                      member.provider.split("/")[0],
                      ...runtimes
                        .filter((r) => r.available)
                        .map((r) => r.provider),
                    ]),
                  ].map((value) => ({ value, label: value }))}
                  onValueChange={(provider) => {
                    setMember({ ...member, provider });
                    setModels([]);
                  }}
                  disabled={busy}
                />
                {button(t("查询此 Runtime 的模型"), () => {
                  void act(async () => {
                    setModels([]);
                    setModels(
                      (
                        await loadModels({
                          hostId: member.hostId,
                          provider: member.provider.split("/")[0],
                          cwd: member.cwd,
                        })
                      ).models,
                    );
                  });
                })}
                {!!models.length && (
                  <SettingsSelect
                    label={t("选择模型")}
                    value={member.provider.slice(
                      member.provider.indexOf("/") + 1,
                    )}
                    options={[
                      {
                        value: member.provider.includes("/")
                          ? member.provider.slice(
                              member.provider.indexOf("/") + 1,
                            )
                          : "",
                        label: member.provider.includes("/")
                          ? member.provider.slice(
                              member.provider.indexOf("/") + 1,
                            )
                          : t("请选择模型"),
                      },
                      ...models.map((m) => ({ value: m.id, label: m.name })),
                    ].filter(
                      (m, i, a) =>
                        a.findIndex((x) => x.value === m.value) === i,
                    )}
                    onValueChange={(model) => {
                      if (model)
                        setMember({
                          ...member,
                          provider: `${member.provider.split("/")[0]}/${model}`,
                        });
                    }}
                  />
                )}
                <Text style={{ color: muted, fontSize: 12 }}>
                  {t(
                    "目录模型不保证网关实际支持；可填写已验证的完整 provider/model 标识。",
                  )}
                </Text>
                {input(t("默认工作目录（无项目时使用）"), member.cwd, (cwd) =>
                  setMember({ ...member, cwd }),
                )}
                {input(
                  t("成员职责"),
                  member.instructions,
                  (instructions) => setMember({ ...member, instructions }),
                  true,
                )}
                {button(t("保存成员"), () => {
                  void act(async () => {
                    await saveMember(member);
                    setMember(initialMember);
                    setEditor(null);
                  });
                })}
              </>
            )}
            {editor === "project" && (
              <>
                {input(
                  t("项目 ID（英文）"),
                  project.id,
                  (id) => setProject({ ...project, id }),
                  false,
                  false,
                  !editingId,
                )}
                {input(t("项目名称"), project.name, (name) =>
                  setProject({ ...project, name }),
                )}
                <Text style={{ color: muted, fontSize: 12 }}>
                  {t(
                    "选择各 Host 已登记的项目；没有时可直接新建。实际目录由对应 Host 管理。",
                  )}
                </Text>
                {state.hosts.map((h) => (
                  <HostProjectPicker
                    key={h.id}
                    host={h}
                    value={project.hostProjects?.[h.id]}
                    legacyPath={project.paths[h.id]}
                    theme={theme}
                    disabled={busy}
                    onPendingChange={onProjectPending}
                    onChange={(p) =>
                      setProject((current) => {
                        const paths = { ...current.paths },
                          hostProjects = { ...current.hostProjects };
                        if (p) {
                          paths[h.id] = p.path;
                          hostProjects[h.id] = p.id;
                        } else {
                          delete paths[h.id];
                          delete hostProjects[h.id];
                        }
                        return { ...current, paths, hostProjects };
                      })
                    }
                  />
                ))}
                {button(t("保存项目"), () => {
                  void act(async () => {
                    if (Object.values(projectPending).some(Boolean))
                      throw new Error(t("请等待 Host 项目操作完成后保存"));
                    await saveProject({
                      ...project,
                      paths: Object.fromEntries(
                        Object.entries(project.paths)
                          .filter(([, v]) => v.trim())
                          .map(([k, v]) => [k, v.trim()]),
                      ),
                    });
                    setEditor(null);
                  });
                })}
              </>
            )}
            {editor === "host" && (
              <>
                <Text style={{ color: muted }}>
                  {t(
                    "添加节点会授权主 Host 后台连接该机器；配对信息只保存在主 Host。",
                  )}
                </Text>
                {input(t("节点名称"), hostName, setHostName)}
                {input(
                  t("Host ID（配对链接中的 serverId）"),
                  hostId,
                  setHostId,
                  false,
                  false,
                  !editingId,
                )}
                {input(t("配对链接"), pairingUrl, setPairingUrl, false, true)}
                {button(t("连接并保存节点"), () => {
                  void act(async () => {
                    await saveHost({
                      id: hostId.trim(),
                      name: hostName.trim(),
                      pairingUrl: pairingUrl.trim(),
                    });
                    setPairingUrl("");
                    setEditor(null);
                  });
                })}
              </>
            )}
            {editor === "inspect" && (
              <Text selectable style={{ color: muted, fontSize: 12 }}>
                {providers || t("正在查询 Runtime…")}
              </Text>
            )}
            {button(editor === "inspect" ? t("关闭") : t("取消"), () => {
              setEditor(null);
              setPairingUrl("");
            })}
          </Modal.Content>
        </Modal>
      )}
      {tab === "board" && state && !task && (
        <>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
            }}
          >
            <View style={{ gap: 4 }}>
              <Text
                style={{ color: foreground, fontSize: 22, fontWeight: "600" }}
              >
                {t("协作任务")}
              </Text>
              <Text style={{ color: muted, fontSize: 12 }}>
                {t("{0} 个任务 · {1} 位成员", {
                  0: state.tasks.length,
                  1: state.members.length,
                })}
              </Text>
            </View>
            {button(
              showCreate ? t("收起表单") : t("＋ 添加任务"),
              () => setShowCreate(!showCreate),
              showCreate,
            )}
          </View>
          {showCreate && (
            <View
              style={{
                gap: 14,
                padding: 18,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: border,
                backgroundColor: surface,
              }}
            >
              {input(t("任务标题"), title, setTitle)}
              {input(
                t("任务目标与验收条件"),
                description,
                setDescription,
                true,
              )}
              <Text style={{ color: muted, fontSize: 12 }}>
                {t("所属项目")}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {button(
                  t("使用成员默认目录"),
                  () => setProjectId(""),
                  !projectId,
                )}
                {state.projects.map((p) => (
                  <View key={p.id}>
                    {button(
                      p.name,
                      () => setProjectId(p.id),
                      projectId === p.id,
                    )}
                  </View>
                ))}
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {button(
                  t("创建任务"),
                  () => {
                    void act(async () => {
                      if (!title.trim()) throw new Error(t("请填写任务标题"));
                      const key = JSON.stringify([
                        title,
                        description,
                        projectId,
                      ]);
                      if (pendingTask.current?.key !== key)
                        pendingTask.current = { key, id: requestId() };
                      const next = await createTask({
                        requestId: pendingTask.current.id,
                        title,
                        description,
                        ...(projectId ? { projectId } : {}),
                      });
                      pendingTask.current = null;
                      setTaskId(next.id);
                      setTitle("");
                      setDescription("");
                      setShowCreate(false);
                    });
                  },
                  true,
                )}
                {button(t("取消"), () => setShowCreate(false))}
              </View>
            </View>
          )}
          {layout.compact && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {Object.entries(labels).map(([status, label]) => (
                <View key={status}>
                  {button(
                    `${label} · ${state.tasks.filter((t) => t.status === status).length}`,
                    () => setFilter(status as keyof typeof labels),
                    filter === status,
                  )}
                </View>
              ))}
            </View>
          )}
          <View
            style={{
              flexDirection: layout.compact ? "column" : "row",
              gap: 12,
            }}
          >
            {Object.entries(labels)
              .filter(([status]) => !layout.compact || status === filter)
              .map(([status, label]) => (
                <View
                  key={status}
                  style={{
                    flex: layout.compact ? undefined : 1,
                    gap: 8,
                    minWidth: 0,
                    padding: 12,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: border,
                    backgroundColor: surface,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      paddingVertical: 2,
                    }}
                  >
                    <View
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: 4,
                        backgroundColor: statusColors[status],
                      }}
                    />
                    <Text
                      style={{
                        color: foreground,
                        fontWeight: "600",
                        fontSize: 13,
                        flex: 1,
                      }}
                    >
                      {label}
                    </Text>
                    <Text style={{ color: muted, fontSize: 12 }}>
                      {state.tasks.filter((t) => t.status === status).length}
                    </Text>
                  </View>
                  {!state.tasks.some((t) => t.status === status) && (
                    <Text
                      style={{
                        color: muted,
                        fontSize: 12,
                        textAlign: "center",
                        paddingVertical: 24,
                      }}
                    >
                      {t("暂无 {0} 任务", { 0: label })}
                    </Text>
                  )}
                  {state.tasks
                    .filter((t) => t.status === status)
                    .map((entry) => (
                      <Pressable
                        key={entry.id}
                        accessibilityRole="button"
                        accessibilityLabel={entry.title}
                        onPress={() => setTaskId(entry.id)}
                        style={({ pressed }) => ({
                          gap: 10,
                          padding: 14,
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor: border,
                          backgroundColor: pressed
                            ? theme.colors.surface2
                            : theme.colors.surface0,
                        })}
                      >
                        <Text
                          numberOfLines={3}
                          style={{
                            color: foreground,
                            fontWeight: "500",
                            fontSize: 14,
                          }}
                        >
                          {entry.title}
                        </Text>
                        {!!entry.controlState && (
                          <Text style={{ color: muted, fontSize: 12 }}>
                            {entry.controlState === "pausing"
                              ? t("暂停中")
                              : t("已暂停")}
                          </Text>
                        )}
                        {!!entry.description && (
                          <Text
                            numberOfLines={2}
                            style={{
                              color: muted,
                              fontSize: 12,
                              lineHeight: 18,
                            }}
                          >
                            {entry.description}
                          </Text>
                        )}
                        <Text style={{ color: muted, fontSize: 11 }}>
                          {state.projects.find((p) => p.id === entry.projectId)
                            ?.name ?? t("默认目录")}{" "}
                          ·{" "}
                          {new Date(entry.createdAt).toLocaleDateString(locale)}
                        </Text>
                      </Pressable>
                    ))}
                </View>
              ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}
