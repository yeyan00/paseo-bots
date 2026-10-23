import type { PluginServerContext } from "@getpaseo/plugin/server";
import { join } from "node:path";
import { Connections, dataDir } from "./server/connections";
import { Store } from "./server/store";
import { Coordinator } from "./server/coordinator";
import { Attachments } from "./server/attachments";
import { preferences } from "./shared/preferences";
import {
  listHostProjects,
  addHostProject,
  browseDirectories,
} from "./server/projects";
import {
  snapshotRpc,
  projectRpc,
  hostProjectsRpc,
  addHostProjectRpc,
  browseDirectoriesRpc,
  modelsRpc,
  runtimesRpc,
  createTaskRpc,
  commentRpc,
  statusRpc,
  memberRpc,
  hostRpc,
  timelineRpc,
  stopRpc,
  inspectRpc,
  permissionRpc,
  uploadAttachmentRpc,
  readAttachmentRpc,
} from "./shared/contracts";

export default function contribute(server: PluginServerContext) {
  server.registerSettings(preferences);
  const connections = new Connections();
  const store = new Store(join(dataDir, "state.json"));
  const attachments = new Attachments(join(dataDir, "attachments"));
  const coordinator = new Coordinator(store, connections, attachments);
  server.handle(uploadAttachmentRpc, (input) => attachments.upload(input));
  server.handle(readAttachmentRpc, async (input) => ({
    base64: (await attachments.read(input.id)).bytes.toString("base64"),
  }));
  server.handle(hostProjectsRpc, (input) =>
    listHostProjects(connections, input.hostId),
  );
  server.handle(addHostProjectRpc, (input) =>
    addHostProject(connections, input),
  );
  server.handle(browseDirectoriesRpc, (input) =>
    browseDirectories(connections, input),
  );
  server.handle(projectRpc, (input) => coordinator.saveProject(input));
  server.handle(runtimesRpc, async (input) => {
    const result = await (
      await connections.get(input.hostId)
    ).api.providers.listAvailable();
    if (result.error) throw new Error(result.error);
    return result.providers.map((p) => ({
      provider: p.provider,
      available: p.available,
    }));
  });
  server.handle(modelsRpc, async (input) => {
    const catalogue = await (
      await connections.get(input.hostId)
    ).api.providers.listModels(input.provider, { cwd: input.cwd });
    if (catalogue.error) throw new Error(String(catalogue.error));
    return {
      models: (catalogue.models ?? []).map((m) => ({ id: m.id, name: m.id })),
    };
  });
  server.handle(snapshotRpc, () => store.read());
  server.handle(createTaskRpc, (input) => coordinator.createTask(input));
  server.handle(commentRpc, (input) => coordinator.comment(input));
  server.handle(memberRpc, async (input) => {
    await coordinator.saveMember(input);
    return true;
  });
  server.handle(statusRpc, async (input) =>
    store.mutate((s) => {
      const task = s.tasks.find((t) => t.id === input.taskId);
      if (!task) throw new Error("任务不存在");
      task.status = input.status;
      return true;
    }),
  );
  server.handle(hostRpc, async (input) => {
    const host = await connections.saveOffer(
      input.id,
      input.name,
      input.pairingUrl,
    );
    await store.mutate((s) => {
      s.hosts = s.hosts.filter((h) => h.id !== host.id).concat(host);
    });
    return host;
  });
  server.handle(inspectRpc, async (input) => ({
    providers: await (
      await connections.get(input.hostId)
    ).api.providers.listAvailable(),
  }));
  server.handle(timelineRpc, (input) =>
    coordinator.timeline(input.runId, input.cursor),
  );
  server.handle(stopRpc, (input) => coordinator.stop(input.runId));
  server.handle(permissionRpc, (input) => coordinator.permission(input));
  return coordinator.start();
}
