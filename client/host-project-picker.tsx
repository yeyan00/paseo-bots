import { useI18n } from "./i18n";
import { useEffect, useState } from "react";
import { Text, View, Pressable } from "react-native";
import { TextInput } from "@getpaseo/plugin/client/react-native";
import { SettingsSelect } from "@getpaseo/plugin/client/ui";
import { useRpc, type PluginScreenProps } from "@getpaseo/plugin/client";
import {
  hostProjectsRpc,
  addHostProjectRpc,
  browseDirectoriesRpc,
  type HostProject,
} from "../shared/contracts";

export function HostProjectPicker({
  host,
  value,
  legacyPath,
  theme,
  disabled,
  onChange,
  onPendingChange,
}: {
  host: { id: string; name: string };
  value?: string;
  legacyPath?: string;
  theme: PluginScreenProps["theme"];
  disabled: boolean;
  onChange(project: HostProject | null): void;
  onPendingChange(hostId: string, pending: boolean): void;
}) {
  const { t } = useI18n();

  const list = useRpc(hostProjectsRpc),
    add = useRpc(addHostProjectRpc),
    browse = useRpc(browseDirectoriesRpc);
  const [projects, setProjects] = useState<HostProject[]>([]);
  const [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const [creating, setCreating] = useState(false),
    [createDirectory, setCreateDirectory] = useState(false);
  const [name, setName] = useState(""),
    [path, setPath] = useState(legacyPath ?? "");
  const [directory, setDirectory] = useState<{
    path: string;
    parent: string;
    entries: { name: string; path: string }[];
  } | null>(null);
  const c = theme.colors;
  useEffect(() => {
    onPendingChange(host.id, loading);
    return () => onPendingChange(host.id, false);
  }, [host.id, loading, onPendingChange]);
  async function refresh() {
    setLoading(true);
    setError("");
    try {
      setProjects(await list({ hostId: host.id }));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("查询失败"));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let active = true;
    setLoading(true);
    void list({ hostId: host.id })
      .then((p) => {
        if (active) setProjects(p);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : t("查询失败"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [host.id, list, t]);
  const selected = projects.find((p) => p.id === value);
  function action(label: string, fn: () => void) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${host.name} ${label}`}
        disabled={disabled || loading}
        onPress={fn}
        style={{
          padding: 10,
          borderWidth: 1,
          borderColor: c.border,
          borderRadius: 8,
          opacity: loading ? 0.5 : 1,
        }}
      >
        <Text style={{ color: c.foreground, fontSize: 13 }}>{label}</Text>
      </Pressable>
    );
  }
  function field(label: string, text: string, fn: (text: string) => void) {
    return (
      <View style={{ gap: 5 }}>
        <Text style={{ color: c.foregroundMuted, fontSize: 12 }}>{label}</Text>
        <TextInput
          accessibilityLabel={`${host.name} ${label}`}
          value={text}
          onChangeText={fn}
          editable={!disabled && !loading}
          autoCapitalize="none"
          style={{
            color: c.foreground,
            borderColor: c.border,
            borderWidth: 1,
            borderRadius: 8,
            padding: 10,
          }}
        />
      </View>
    );
  }
  async function browsePath(target: string) {
    setLoading(true);
    setError("");
    try {
      const d = await browse({ hostId: host.id, path: target });
      setDirectory(d);
      setPath(d.path);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("浏览失败"));
    } finally {
      setLoading(false);
    }
  }
  return (
    <View
      style={{
        gap: 10,
        borderWidth: 1,
        borderColor: c.border,
        borderRadius: 10,
        padding: 12,
      }}
    >
      <SettingsSelect
        label={t("{0} 的项目", { 0: host.name })}
        value={value ?? ""}
        disabled={disabled || loading}
        options={[
          {
            value: "",
            label:
              legacyPath && !value
                ? t("旧目录关联（选择项目后替换）")
                : t("不参与此协作项目"),
          },
          ...(value && !selected
            ? [{ value, label: t("已关联项目（待刷新确认）") }]
            : []),
          ...projects.map((p) => ({
            value: p.id,
            label: `${p.name} · ${p.path}`,
          })),
        ]}
        onValueChange={(id) => {
          const p = projects.find((p) => p.id === id);
          if (!id || p) onChange(p ?? null);
        }}
      />
      <Text selectable style={{ color: c.foregroundMuted, fontSize: 12 }}>
        {selected?.path ??
          legacyPath ??
          (loading ? t("正在查询项目…") : t("请选择此 Host 已有的项目"))}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {action(t("刷新项目"), () => {
          void refresh();
        })}
        {action(creating ? t("收起新建项目") : t("新建 Host 项目"), () => {
          setCreating(!creating);
          setError("");
        })}
        {!!legacyPath &&
          !value &&
          action(t("取消旧目录关联"), () => onChange(null))}
      </View>
      {!!error && (
        <Text accessibilityRole="alert" style={{ color: c.statusDanger }}>
          {error}
        </Text>
      )}
      {creating && (
        <View style={{ gap: 12 }}>
          <Text style={{ color: c.foregroundMuted, fontSize: 12 }}>
            {t(
              "直接保存到此 Host 的 Paseo 项目列表，保存后自动关联。取消协作项目编辑不会删除已创建的 Host 项目。",
            )}
          </Text>
          {field(t("项目名称"), name, setName)}
          <SettingsSelect
            label={t("目录方式")}
            value={createDirectory ? "new" : "existing"}
            options={[
              { value: "existing", label: t("登记已有目录") },
              { value: "new", label: t("创建新目录") },
            ]}
            disabled={disabled || loading}
            onValueChange={(v) => {
              setCreateDirectory(v === "new");
              setDirectory(null);
            }}
          />
          {field(createDirectory ? t("父目录") : t("项目目录"), path, setPath)}
          {action(t("浏览目录"), () => {
            void browsePath(path);
          })}
          {directory && (
            <View style={{ gap: 6 }}>
              {action(t("上级目录"), () => {
                void browsePath(directory.parent);
              })}
              {directory.entries.map((e) => (
                <View key={e.path}>
                  {action(t("打开 {0}", { 0: e.name }), () => {
                    void browsePath(e.path);
                  })}
                </View>
              ))}
              {!directory.entries.length && (
                <Text style={{ color: c.foregroundMuted }}>
                  {t("没有子目录，可使用当前目录。")}
                </Text>
              )}
            </View>
          )}
          {createDirectory && (
            <Text style={{ color: c.foregroundMuted, fontSize: 12 }}>
              {t("在父目录下，以项目名称创建一个新目录。")}
            </Text>
          )}
          {action(t("保存 Host 项目并选中"), () => {
            void (async () => {
              setLoading(true);
              setError("");
              try {
                if (!name.trim()) throw new Error(t("请填写项目名称"));
                if (
                  createDirectory &&
                  (/[/\\]/.test(name) || [".", ".."].includes(name.trim()))
                )
                  throw new Error(t("新目录名称不能包含路径分隔符"));
                const sep = /^[a-z]:[\\/]|^\\\\/i.test(path) ? "\\" : "/";
                const target = createDirectory
                  ? path.replace(/[/\\]+$/, "") + sep + name.trim()
                  : path;
                const p = await add({
                  hostId: host.id,
                  path: target,
                  name: name.trim(),
                  createDirectory,
                });
                setProjects((old) =>
                  old.filter((x) => x.id !== p.id).concat(p),
                );
                onChange(p);
                setCreating(false);
                setDirectory(null);
              } catch (e) {
                setError(e instanceof Error ? e.message : t("保存失败"));
              } finally {
                setLoading(false);
              }
            })();
          })}
        </View>
      )}
    </View>
  );
}
