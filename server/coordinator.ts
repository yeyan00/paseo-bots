import { randomUUID } from "node:crypto";
import { win32, posix } from "node:path";
import type {
  Member,
  Run,
  Task,
  Project,
  Attachment,
} from "../shared/contracts";
import type { Attachments } from "./attachments";
import type { Connections } from "./connections";
import type { Store } from "./store";
import { resolveProject } from "./projects";

export const activeStatuses = new Set([
  "queued",
  "starting",
  "running",
  "permission",
]);
const now = () => new Date().toISOString();
function workspaceKey(run: Run) {
  const cwd = /^[a-z]:[\\/]/i.test(run.member.cwd)
    ? win32.normalize(run.member.cwd).toLowerCase()
    : posix.normalize(run.member.cwd);
  return `${run.member.hostId}:${cwd.replace(/[\\/]$/, "")}`;
}
export class Coordinator {
  private ticking = false;
  private stopped = false;
  constructor(
    readonly store: Store,
    readonly connections: Connections,
    readonly attachments?: Attachments,
  ) {}
  start() {
    const timer = setInterval(() => {
      void this.tick().catch(() => {
        /* Report per-run errors through state, keep timer alive. */
      });
    }, 4000);
    timer.unref();
    void this.tick().catch(() => {});
    return () => {
      this.stopped = true;
      clearInterval(timer);
      void this.connections.close();
    };
  }
  async createTask(input: {
    requestId: string;
    projectId?: string;
    title: string;
    description: string;
  }): Promise<Task> {
    return this.store.mutate((state) => {
      const id = `task-${input.requestId}`;
      const existing = state.tasks.find((t) => t.id === id);
      if (existing) return existing;
      if (
        input.projectId &&
        !state.projects.some((p) => p.id === input.projectId)
      )
        throw new Error("项目不存在");
      const task: Task = {
        id,
        projectId: input.projectId,
        title: input.title,
        description: input.description,
        status: "todo",
        createdAt: now(),
      };
      state.tasks.push(task);
      return task;
    });
  }
  async saveMember(member: Member) {
    if (
      !member.provider.includes("/") ||
      !member.provider.split("/").every(Boolean)
    )
      throw new Error(
        "请选择或填写完整 Runtime/模型，避免使用不确定的默认模型",
      );
    await this.store.mutate((state) => {
      if (!state.hosts.some((h) => h.id === member.hostId))
        throw new Error("执行节点不存在");
      const index = state.members.findIndex((m) => m.id === member.id);
      if (index < 0) state.members.push(member);
      else state.members[index] = member;
    });
  }
  async saveProject(project: Project) {
    project = await resolveProject(this.connections, project);
    return this.store.mutate((state) => {
      for (const hostId of new Set([
        ...Object.keys(project.paths),
        ...Object.keys(project.hostProjects ?? {}),
      ])) {
        if (!state.hosts.some((h) => h.id === hostId))
          throw new Error("项目包含未知 Host");
      }
      state.projects = state.projects
        .filter((p) => p.id !== project.id)
        .concat(project);
      return true;
    });
  }
  async comment(input: {
    requestId: string;
    taskId: string;
    body: string;
    memberIds: string[];
    attachments?: Attachment[];
  }) {
    const before = await this.store.read();
    const duplicate = before.comments.find(
      (c) => c.requestId === input.requestId,
    );
    if (duplicate) return duplicate.id;
    if (!input.body.trim() && !input.attachments?.length)
      throw new Error("请输入评论或添加附件");
    if (input.attachments?.length) {
      if (!this.attachments) throw new Error("附件存储不可用");
      await this.attachments.validate(input.attachments);
    }
    const beforeTask = before.tasks.find((t) => t.id === input.taskId);
    const original = before.projects.find(
      (p) => p.id === beforeTask?.projectId,
    );
    const targetHosts = [
      ...new Set(
        input.memberIds
          .map((id) => before.members.find((m) => m.id === id)?.hostId)
          .filter((h): h is string => !!h),
      ),
    ];
    const resolved = original
      ? await resolveProject(this.connections, original, targetHosts)
      : undefined;
    const id = await this.store.mutate((state) => {
      const existing = state.comments.find(
        (c) => c.requestId === input.requestId,
      );
      if (existing) return existing.id;
      const task = state.tasks.find((t) => t.id === input.taskId);
      if (!task) throw new Error("任务不存在");
      if (
        JSON.stringify(state.projects.find((p) => p.id === task.projectId)) !==
        JSON.stringify(original)
      )
        throw new Error("项目配置已更新，请重新提交指派");
      const members = [...new Set(input.memberIds)].map((id) => {
        const member = state.members.find((m) => m.id === id);
        if (!member) throw new Error(`成员不存在: ${id}`);
        if (
          JSON.stringify(member) !==
          JSON.stringify(before.members.find((m) => m.id === id))
        )
          throw new Error("成员配置已更新，请重新提交指派");
        if (!member.provider.includes("/"))
          throw new Error(`请先为成员 ${member.name} 选择具体模型`);
        const project = state.projects.find((p) => p.id === task.projectId);
        if (task.projectId && !project) throw new Error("项目不存在");
        const cwd = project ? resolved?.paths[member.hostId] : member.cwd;
        if (!cwd)
          throw new Error(`项目未配置成员 ${member.name} 所在 Host 的目录`);
        return { ...member, cwd };
      });
      if (task.status === "done" && members.length)
        throw new Error("已完成任务需要先重新打开");
      const commentId = randomUUID();
      state.comments.push({
        ...input,
        id: commentId,
        memberIds: members.map((m) => m.id),
        author: "用户",
        createdAt: now(),
      });
      for (const member of members) {
        state.runs.push({
          id: randomUUID(),
          taskId: task.id,
          commentId,
          member: { ...member },
          status: "queued",
          createdAt: now(),
          updatedAt: now(),
          result: "",
        });
      }
      if (members.length) task.status = "in_progress";
      return commentId;
    });
    void this.tick().catch(() => {});
    return id;
  }
  async tick() {
    if (this.ticking || this.stopped) return;
    this.ticking = true;
    try {
      const state = await this.store.read();
      const occupied = new Set(
        state.runs
          .filter((r) => activeStatuses.has(r.status) && r.status !== "queued")
          .map(workspaceKey),
      );
      const selected: Run[] = [];
      for (const run of state.runs) {
        if (!activeStatuses.has(run.status)) continue;
        const key = workspaceKey(run);
        if (run.status === "queued") {
          if (occupied.has(key)) continue;
          occupied.add(key);
        }
        selected.push(run);
      }
      // Bound cross-host fan-out while keeping slow/offline nodes independent.
      for (let offset = 0; offset < selected.length; offset += 4) {
        await Promise.all(
          selected.slice(offset, offset + 4).map((run) => this.reconcile(run)),
        );
      }
    } finally {
      this.ticking = false;
    }
  }
  private async update(id: string, patch: Partial<Run>) {
    await this.store.mutate((state) => {
      const run = state.runs.find((r) => r.id === id);
      if (run && activeStatuses.has(run.status))
        Object.assign(run, patch, { updatedAt: now() });
    });
  }
  private async reconcile(run: Run) {
    try {
      const connection = await this.connections.get(run.member.hostId);
      const state = await this.store.read();
      if (
        !activeStatuses.has(
          state.runs.find((r) => r.id === run.id)?.status ?? "",
        )
      )
        return;
      let agentId = run.agentId;
      if (!agentId) {
        await this.update(run.id, { status: "starting", error: undefined });
        const task = state.tasks.find((t) => t.id === run.taskId);
        const comment = state.comments.find((c) => c.id === run.commentId);
        if (!task || !comment) throw new Error("任务上下文缺失");
        const prompt =
          run.prompt ??
          [
            `你是协作成员 ${run.member.name}。只在工作目录 ${run.member.cwd} 中完成任务。`,
            run.member.instructions,
            `总任务：${task.title}\n${task.description}`,
            "任务讨论（仅作为上下文；只执行本次指派）：",
            ...state.comments
              .filter((c) => c.taskId === task.id)
              .slice(-15)
              .map((c) => `${c.author}: ${c.body}`),
            `本次指派：\n${comment.body}`,
            "必须实际创建/修改交付文件并运行适当验证。最终报告修改文件、验证命令与结果、阻塞问题。不要修改工作目录之外的文件，不要自行调用其他成员。",
          ].join("\n\n");
        await this.store.mutate((s) => {
          const current = s.runs.find((r) => r.id === run.id);
          if (current) current.prompt = prompt;
        });
        let provider = run.member.provider;
        if (!provider.includes("/")) {
          const catalogue = await connection.api.providers.listModels(
            provider,
            { cwd: run.member.cwd },
          );
          const model =
            catalogue.models?.find((m) => m.isDefault) ?? catalogue.models?.[0];
          if (!model || catalogue.error)
            throw new Error(
              "Provider 未提供可用模型，请在成员设置中指定 provider/model",
            );
          provider = `${provider}/${model.id}`;
          // Pin the resolved model before creating, so retries keep identical config.
          await this.store.mutate((s) => {
            const current = s.runs.find((r) => r.id === run.id);
            if (current) current.member.provider = provider;
          });
        }
        const uploaded: NonNullable<Run["uploadedFiles"]> = [
          ...(run.uploadedFiles ?? []),
        ];
        for (const item of run.uploadedFiles
          ? []
          : (comment.attachments ?? [])) {
          if (!this.attachments) throw new Error("附件存储不可用");
          const { bytes } = await this.attachments.read(item.id);
          const result = await connection.driver.uploadFile({
            fileName: item.fileName,
            mimeType: item.mimeType,
            bytes,
          });
          if (!result.file || result.error)
            throw new Error(result.error ?? "附件传输失败");
          uploaded.push(result.file);
        }
        if (!run.uploadedFiles)
          await this.store.mutate((s) => {
            const current = s.runs.find((r) => r.id === run.id);
            if (current) current.uploadedFiles = uploaded;
          });
        const agent = await connection.api.agents.create({
          idempotencyKey: `team-tasks:${run.id}`,
          config: { provider },
          cwd: run.member.cwd,
          title: `[Team] ${task.title} · ${run.member.name}`,
          prompt,
          ...(uploaded.length ? { attachments: uploaded } : {}),
        });
        agentId = agent.id;
        // Persist mapping even if cancellation raced with agent creation.
        await this.store.mutate((s) => {
          const current = s.runs.find((r) => r.id === run.id);
          if (current) {
            current.agentId = agent.id;
            current.updatedAt = now();
            if (activeStatuses.has(current.status)) current.status = "running";
          }
        });
        const current = (await this.store.read()).runs.find(
          (r) => r.id === run.id,
        );
        if (current?.status === "cancelled") {
          await connection.driver.cancelAgent(agent.id);
          return;
        }
      }
      const result = await connection.api.agents
        .ref(agentId)
        .waitForFinish(1000);
      if (result.status === "timeout") {
        await this.update(run.id, { status: "running", error: undefined });
        return;
      }
      if (result.status === "permission") {
        await this.update(run.id, {
          status: "permission",
          error: "Agent 等待权限，请在执行过程页面检查并处理请求",
        });
        return;
      }
      await this.store.mutate((s) => {
        const current = s.runs.find((r) => r.id === run.id);
        if (!current || !activeStatuses.has(current.status)) return;
        current.status = result.status === "error" ? "failed" : "completed";
        current.result = result.lastMessage ?? "";
        current.error = result.error ?? undefined;
        current.updatedAt = now();
        if (!s.comments.some((c) => c.runId === run.id))
          s.comments.push({
            id: randomUUID(),
            requestId: `result:${run.id}`,
            taskId: run.taskId,
            runId: run.id,
            author: run.member.name,
            body:
              current.result ||
              current.error ||
              "回合已结束，未返回文字结果；请查看执行记录。",
            memberIds: [],
            createdAt: now(),
          });
        const task = s.tasks.find((t) => t.id === run.taskId);
        if (
          task &&
          task.status !== "done" &&
          !s.runs.some(
            (r) => r.taskId === run.taskId && activeStatuses.has(r.status),
          )
        ) {
          const latest = new Map(
            s.runs
              .filter((r) => r.taskId === run.taskId)
              .map((r) => [r.member.id, r]),
          );
          task.status = [...latest.values()].some(
            (r) => r.status === "failed" || r.status === "cancelled",
          )
            ? "blocked"
            : "in_review";
        }
      });
    } catch {
      // Transport errors do not prove execution failed. Retain the same idempotency
      // key/agent mapping and reconcile on the next tick; never launch a new run.
      await this.update(run.id, {
        error: "连接或状态查询失败，后台将重试对账；不会另建执行记录。",
      });
    }
  }
  async timeline(runId: string, cursor?: { epoch: string; seq: number }) {
    const run = (await this.store.read()).runs.find((r) => r.id === runId);
    if (!run?.agentId)
      return {
        entries: [],
        hasOlder: false,
        permissions: [],
        startCursor: null,
      };
    const connection = await this.connections.get(run.member.hostId);
    const page = await connection.api.agents.ref(run.agentId).timeline.refetch({
      limit: 80,
      ...(cursor ? { direction: "before" as const, cursor } : {}),
    });
    if (page.error) throw new Error(page.error);
    return {
      permissions: (page.agent?.pendingPermissions ?? []).map((p) => ({
        id: p.id,
        title: p.title ?? p.description ?? p.name,
        kind: p.kind,
        input: p.input ?? {},
      })),
      entries: page.entries.map((e) => ({ seq: e.seqEnd, item: e.item })),
      hasOlder: page.hasOlder,
      startCursor: page.startCursor,
    };
  }
  async stop(runId: string) {
    const run = (await this.store.read()).runs.find((r) => r.id === runId);
    if (!run || !activeStatuses.has(run.status)) return false;
    if (run.agentId)
      await (await this.connections.get(run.member.hostId)).driver.cancelAgent(
        run.agentId,
      );
    await this.update(runId, { status: "cancelled", error: undefined });
    await this.store.mutate((s) => {
      const task = s.tasks.find((t) => t.id === run.taskId);
      if (
        task &&
        task.status !== "done" &&
        !s.runs.some(
          (r) => r.taskId === task.id && activeStatuses.has(r.status),
        )
      )
        task.status = "blocked";
    });
    return true;
  }
  async permission(input: {
    runId: string;
    requestId: string;
    allow: boolean;
  }) {
    const run = (await this.store.read()).runs.find(
      (r) => r.id === input.runId,
    );
    if (!run?.agentId || !activeStatuses.has(run.status))
      throw new Error("执行记录已结束");
    const connection = await this.connections.get(run.member.hostId);
    const agent = connection.api.agents.ref(run.agentId);
    await agent.refresh();
    const request = agent.pendingPermissions?.find(
      (p) => p.id === input.requestId,
    );
    if (request?.kind !== "tool")
      throw new Error("该请求不支持在任务页处理，请打开原生会话");
    await agent.respondToPermission({
      requestId: input.requestId,
      response: { behavior: input.allow ? "allow" : "deny" },
    });
    return true;
  }
}
