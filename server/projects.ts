import { win32, posix } from "node:path";
import type { PaseoProject } from "@getpaseo/client";
import type { Connections } from "./connections";
import type { Project } from "../shared/contracts";

const descriptor = (p: PaseoProject) => ({
  id: p.projectId,
  name: p.projectDisplayName,
  path: p.projectRootPath,
});
const pathApi = (path: string) =>
  /^[a-z]:[\\/]|^\\\\/i.test(path) ? win32 : posix;
export async function listHostProjects(
  connections: Connections,
  hostId: string,
) {
  const result = await (await connections.get(hostId)).api.projects.list();
  return result.projects.map(descriptor);
}
export async function resolveProject(
  connections: Connections,
  project: Project,
  hosts = Object.keys(project.hostProjects ?? {}),
) {
  const paths = { ...project.paths };
  await Promise.all(
    hosts.map(async (hostId) => {
      const id = project.hostProjects?.[hostId];
      if (!id) return;
      const found = (await listHostProjects(connections, hostId)).find(
        (p) => p.id === id,
      );
      if (!found) throw new Error(`Host ${hostId} 的项目已不存在，请重新选择`);
      paths[hostId] = found.path;
    }),
  );
  return { ...project, paths };
}
export async function addHostProject(
  connections: Connections,
  input: {
    hostId: string;
    path: string;
    name: string;
    createDirectory: boolean;
  },
) {
  const { driver } = await connections.get(input.hostId);
  const target = input.path.trim();
  const api = pathApi(target);
  if (!api.isAbsolute(target)) throw new Error("请输入目标 Host 的绝对目录");
  const key = (p: string) => {
    const normalized = api.normalize(p).replace(/[\\/]$/, "");
    return api === win32 ? normalized.toLowerCase() : normalized;
  };
  const existing = (await listHostProjects(connections, input.hostId)).find(
    (p) => key(p.path) === key(target),
  );
  const result = existing
    ? {
        error: null,
        project: {
          projectId: existing.id,
          projectDisplayName: existing.name,
          projectRootPath: existing.path,
          projectKind: "directory" as const,
        },
      }
    : input.createDirectory
      ? await driver.createProjectDirectory({
          parentPath: api.dirname(target),
          name: api.basename(target),
        })
      : await driver.addProject(target);
  if (result.error || !result.project)
    throw new Error(result.error ?? "创建项目失败");
  // Registration is kept even if renaming fails; retrying selects the same directory.
  if (input.name.trim() !== result.project.projectDisplayName)
    await driver.renameProject(result.project.projectId, input.name.trim());
  return { ...descriptor(result.project), name: input.name.trim() };
}
export async function browseDirectories(
  connections: Connections,
  input: { hostId: string; path: string },
) {
  const api = pathApi(input.path);
  if (!api.isAbsolute(input.path))
    throw new Error("请输入目标 Host 的绝对目录");
  const result = await (
    await connections.get(input.hostId)
  ).driver.listDirectory(input.path, ".");
  return {
    path: api.resolve(input.path, result.path),
    parent: api.dirname(api.resolve(input.path, result.path)),
    entries: result.entries
      .filter((e) => e.kind === "directory")
      .map((e) => ({ name: e.name, path: api.resolve(input.path, e.path) })),
  };
}
