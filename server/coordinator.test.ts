import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { Coordinator } from "./coordinator";
import { Store } from "./store";
import type { Connections } from "./connections";
import { addHostProject, browseDirectories } from "./projects";
import { Attachments } from "./attachments";

const dirs: string[] = [];
const coordinators: Coordinator[] = [];
afterEach(async () => {
  await Promise.all(coordinators.splice(0).map((c) => c.tick()));
  await Promise.all(
    dirs.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "team-coordinator-"));
  dirs.push(dir);
  const store = new Store(join(dir, "state.json"));
  let outcome: {
    status: string;
    lastMessage: string | null;
    error: string | null;
  } = {
    status: "timeout",
    lastMessage: null as string | null,
    error: null,
  };
  let loseAck = false;
  const creations = new Map<string, string>();
  const create = vi.fn(
    async (input: { idempotencyKey: string; prompt?: string }) => {
      let id = creations.get(input.idempotencyKey);
      if (!id) {
        id = `agent-${creations.size}`;
        creations.set(input.idempotencyKey, id);
      }
      if (loseAck) {
        loseAck = false;
        throw new Error("ack lost after create");
      }
      return { id };
    },
  );
  const cancel = vi.fn(async () => {});
  const send = vi.fn(
    async (_id: string, _text: string, _options: unknown) => {},
  );
  const uploadFile = vi.fn(
    async (input: {
      fileName: string;
      mimeType: string;
      bytes: Uint8Array;
    }) => ({
      file: {
        type: "uploaded_file" as const,
        id: "uploaded",
        fileName: input.fileName,
        mimeType: input.mimeType,
        size: input.bytes.length,
        path: "/uploads/file",
      },
      error: null,
    }),
  );
  const refetch = vi.fn(async (_options: unknown) => ({
    entries: [
      {
        seqEnd: 9,
        item: {
          type: "assistant_message",
          text: "history",
          clientMessageId: undefined as string | undefined,
        },
      },
    ],
    startCursor: { epoch: "e", seq: 9 },
    hasOlder: true,
    error: null,
    agent: null,
  }));
  const connection = {
    api: {
      projects: {
        list: vi.fn(async () => ({
          projects: [
            {
              projectId: "native-project",
              projectDisplayName: "Native",
              projectRootPath: "C:\\native",
              projectKind: "directory",
            },
          ],
        })),
      },
      agents: {
        create,
        ref: () => ({
          waitForFinish: async () => outcome,
          timeline: { refetch },
        }),
      },
    },
    driver: { cancelAgent: cancel, uploadFile, sendAgentMessage: send },
  };
  const connections = {
    get: async () => connection,
    close: async () => {},
  } as unknown as Connections;
  const attachments = new Attachments(join(dir, "attachments"));
  const coordinator = new Coordinator(store, connections, attachments);
  coordinators.push(coordinator);
  await coordinator.saveMember({
    id: "dev",
    name: "Dev",
    hostId: "local",
    provider: "codex/test-model",
    cwd: "C:\\test",
    instructions: "",
  });
  const task = await coordinator.createTask({
    requestId: "task1",
    title: "Example",
    description: "",
  });
  return {
    store,
    attachments,
    uploadFile,
    refetch,
    coordinator,
    connections,
    task,
    create,
    projectList: connection.api.projects.list,
    cancel,
    send,
    creations,
    lostAck: () => {
      loseAck = true;
    },
    finish: () => {
      outcome = { status: "idle", lastMessage: "Verified", error: null };
    },
    fail: () => {
      outcome = { status: "error", lastMessage: null, error: "test failure" };
    },
  };
}
async function waitTick(coordinator: Coordinator) {
  // Wait for the background tick launched by comment(), then explicitly reconcile.
  for (let n = 0; n < 10; n++) await new Promise((r) => setTimeout(r, 5));
  await coordinator.tick();
}

test("project paths override member defaults and are pinned per execution", async () => {
  const f = await fixture();
  await f.coordinator.saveProject({
    id: "demo",
    name: "Demo",
    paths: { local: "C:\\project" },
  });
  const task = await f.coordinator.createTask({
    requestId: "project-task",
    title: "Project",
    description: "",
    projectId: "demo",
  });
  await f.coordinator.comment({
    requestId: "project-run",
    taskId: task.id,
    body: "Build",
    memberIds: ["dev"],
  });
  await waitTick(f.coordinator);
  await f.coordinator.saveProject({
    id: "demo",
    name: "Demo",
    paths: { local: "C:\\changed" },
  });
  const state = await f.store.read();
  expect(state.runs[0].member.cwd).toBe("C:\\project");
  expect(state.members[0].cwd).toBe("C:\\test");
  expect(f.create).toHaveBeenCalledWith(
    expect.objectContaining({ cwd: "C:\\project" }),
  );
});

test("missing project paths reject all assignments atomically", async () => {
  const f = await fixture();
  await f.coordinator.saveProject({ id: "empty", name: "Empty", paths: {} });
  const task = await f.coordinator.createTask({
    requestId: "empty-task",
    title: "Empty",
    description: "",
    projectId: "empty",
  });
  await expect(
    f.coordinator.comment({
      requestId: "bad-path",
      taskId: task.id,
      body: "Build",
      memberIds: ["dev"],
    }),
  ).rejects.toThrow("项目未配置");
  expect((await f.store.read()).comments).toHaveLength(0);
  expect((await f.store.read()).runs).toHaveLength(0);
  await expect(
    f.coordinator.saveProject({
      id: "bad",
      name: "Bad",
      paths: { unknown: "/tmp" },
    }),
  ).rejects.toThrow("未知 Host");
});

test("multiple runtimes on one Host remain independent team members", async () => {
  const f = await fixture();
  await f.coordinator.saveMember({
    id: "reviewer",
    name: "Reviewer",
    hostId: "local",
    provider: "opencode/test-model",
    cwd: "C:\\review",
    instructions: "Review",
  });
  await f.coordinator.comment({
    requestId: "multi",
    taskId: f.task.id,
    body: "Work",
    memberIds: ["dev", "reviewer"],
  });
  await waitTick(f.coordinator);
  const runs = (await f.store.read()).runs;
  expect(runs.map((r) => r.member.provider)).toEqual([
    "codex/test-model",
    "opencode/test-model",
  ]);
  expect(f.creations.size).toBe(2);
});

test("members require an explicit model instead of a runtime default", async () => {
  const f = await fixture();
  await expect(
    f.coordinator.saveMember({
      id: "bare",
      name: "Bare",
      hostId: "local",
      provider: "codex",
      cwd: "C:\\test",
      instructions: "",
    }),
  ).rejects.toThrow("完整 Runtime/模型");
  expect((await f.store.read()).members).toHaveLength(1);
});

test("native project bindings resolve fresh paths and reject deleted projects before creating runs", async () => {
  const f = await fixture();
  await f.coordinator.saveProject({
    id: "native",
    name: "Native",
    paths: { local: "C:\\stale" },
    hostProjects: { local: "native-project" },
  });
  expect((await f.store.read()).projects[0].paths.local).toBe("C:\\native");
  const task = await f.coordinator.createTask({
    requestId: "native-task",
    projectId: "native",
    title: "Native",
    description: "",
  });
  f.projectList.mockResolvedValue({
    projects: [
      {
        projectId: "native-project",
        projectDisplayName: "Renamed",
        projectRootPath: "C:\\moved",
        projectKind: "directory",
      },
    ],
  });
  await f.coordinator.comment({
    requestId: "native-first",
    taskId: task.id,
    body: "Build",
    memberIds: ["dev"],
  });
  await waitTick(f.coordinator);
  expect(f.create).toHaveBeenCalledWith(
    expect.objectContaining({ cwd: "C:\\moved" }),
  );
  f.projectList.mockResolvedValue({ projects: [] });
  await expect(
    f.coordinator.comment({
      requestId: "native-second",
      taskId: task.id,
      body: "Build",
      memberIds: ["dev"],
    }),
  ).rejects.toThrow("已不存在");
  expect((await f.store.read()).runs).toHaveLength(1);
  expect((await f.store.read()).runs[0].member.cwd).toBe("C:\\moved");
  // Idempotent retry must work even after the Host project disappears.
  await f.coordinator.comment({
    requestId: "native-first",
    taskId: task.id,
    body: "Build",
    memberIds: ["dev"],
  });
  expect((await f.store.read()).comments).toHaveLength(1);
});

test("directory browsing resolves relative daemon paths on both platforms", async () => {
  const connections = {
    get: async () => ({
      driver: {
        listDirectory: async () => ({
          path: ".",
          entries: [
            { kind: "directory", name: "child", path: "child" },
            { kind: "file", name: "file", path: "file" },
          ],
        }),
      },
    }),
  } as unknown as Connections;
  expect(
    await browseDirectories(connections, { hostId: "local", path: "C:\\test" }),
  ).toEqual({
    path: "C:\\test",
    parent: "C:\\",
    entries: [{ name: "child", path: "C:\\test\\child" }],
  });
  expect(
    (
      await browseDirectories(connections, {
        hostId: "remote",
        path: "/data/test",
      })
    ).entries[0].path,
  ).toBe("/data/test/child");
});

test("Host project creation retries reuse registered directories and preserve Linux case", async () => {
  const create = vi.fn(async () => ({
    error: null,
    project: {
      projectId: "new",
      projectDisplayName: "test",
      projectRootPath: "/data/test",
      projectKind: "directory",
    },
  }));
  const connections = {
    get: async () => ({
      api: {
        projects: {
          list: async () => ({
            projects: [
              {
                projectId: "old",
                projectDisplayName: "Test",
                projectRootPath: "/data/Test",
                projectKind: "directory",
              },
            ],
          }),
        },
      },
      driver: { createProjectDirectory: create, renameProject: vi.fn() },
    }),
  } as unknown as Connections;
  await addHostProject(connections, {
    hostId: "remote",
    path: "/data/Test",
    name: "Test",
    createDirectory: true,
  });
  expect(create).not.toHaveBeenCalled();
  await addHostProject(connections, {
    hostId: "remote",
    path: "/data/test",
    name: "test",
    createDirectory: true,
  });
  expect(create).toHaveBeenCalledWith({ parentPath: "/data", name: "test" });
});
test("assignment limit is persisted, enforced, and can be removed", async () => {
  const f = await fixture();
  const bots = Array.from({ length: 9 }, (_, i) => `bot-${i}`);
  await f.store.mutate((state) => {
    const base = state.members[0];
    state.members.push(...bots.map((id) => ({ ...base, id, name: id })));
    state.assignmentSettings = { maxMembersPerComment: 2 };
  });
  expect((await new Store(f.store.path).read()).assignmentSettings).toEqual({
    maxMembersPerComment: 2,
  });
  const input = {
    requestId: "limited",
    taskId: f.task.id,
    body: "Implement",
    memberIds: bots,
  };
  await expect(f.coordinator.comment(input)).rejects.toThrow("最多指派 2");
  expect((await f.store.read()).comments).toHaveLength(0);
  await f.store.mutate((state) => {
    state.assignmentSettings = { maxMembersPerComment: 0 };
  });
  await f.coordinator.comment(input);
  expect((await f.store.read()).runs).toHaveLength(9);
});

test("duplicate comments/mentions create only one execution", async () => {
  const f = await fixture();
  const input = {
    requestId: "comment1",
    taskId: f.task.id,
    body: "Implement",
    memberIds: ["dev", "dev"],
  };
  await Promise.all([
    f.coordinator.comment(input),
    f.coordinator.comment(input),
  ]);
  await waitTick(f.coordinator);
  expect((await f.store.read()).runs).toHaveLength(1);
  expect(f.creations.size).toBe(1);
});
test("lost create acknowledgement and coordinator restart reuse the same creation key", async () => {
  const f = await fixture();
  f.lostAck();
  await f.coordinator.comment({
    requestId: "comment1",
    taskId: f.task.id,
    body: "Implement",
    memberIds: ["dev"],
  });
  await waitTick(f.coordinator);
  const recovered = new Coordinator(new Store(f.store.path), f.connections);
  await recovered.tick();
  f.finish();
  await recovered.tick();
  await recovered.tick();
  const state = await f.store.read();
  expect(f.creations.size).toBe(1);
  expect(state.runs[0].agentId).toBe("agent-0");
  expect(state.runs[0].status).toBe("completed");
  expect(state.comments.filter((c) => c.runId)).toHaveLength(1);
  expect(state.tasks[0].status).toBe("in_review");
});
test("same host/workspace is serialized and cancellation releases the slot", async () => {
  const f = await fixture();
  await f.coordinator.comment({
    requestId: "one",
    taskId: f.task.id,
    body: "First",
    memberIds: ["dev"],
  });
  await waitTick(f.coordinator);
  await f.coordinator.comment({
    requestId: "two",
    taskId: f.task.id,
    body: "Second",
    memberIds: ["dev"],
  });
  await waitTick(f.coordinator);
  expect(f.creations.size).toBe(1);
  const first = (await f.store.read()).runs[0];
  await f.coordinator.stop(first.id);
  await f.coordinator.tick();
  expect(f.cancel).toHaveBeenCalledWith(first.agentId);
  expect(f.creations.size).toBe(1);
  expect(f.send).toHaveBeenCalledWith(
    first.agentId,
    expect.stringContaining("Second"),
    expect.anything(),
  );
});

test("stop then correction continues the same agent with recent discussion", async () => {
  const f = await fixture();
  await f.coordinator.comment({
    requestId: "original",
    taskId: f.task.id,
    body: "Build the old design",
    memberIds: ["dev"],
  });
  await waitTick(f.coordinator);
  const original = (await f.store.read()).runs[0];
  await f.coordinator.stop(original.id);
  expect(f.cancel).toHaveBeenCalledWith(original.agentId);
  await f.coordinator.comment({
    requestId: "correction",
    taskId: f.task.id,
    body: "The old design is wrong. Use the corrected interface.",
    memberIds: [],
  });
  await waitTick(f.coordinator);
  expect(f.creations.size).toBe(1);
  expect((await f.store.read()).runs[0].status).toBe("cancelled");
  const commentId = await f.coordinator.comment({
    requestId: "restart",
    taskId: f.task.id,
    body: "Continue with the correction above",
    memberIds: ["dev"],
  });
  await waitTick(f.coordinator);
  const state = await f.store.read();
  expect(state.runs).toHaveLength(2);
  expect(state.runs[1].agentId).toBe(original.agentId);
  expect(state.runs[1].previousRunId).toBe(original.id);
  expect(f.creations.size).toBe(1);
  expect(f.send).toHaveBeenCalledTimes(1);
  expect(state.runs[1].commentId).toBe(commentId);
  expect(state.runs[1].prompt).toContain(
    "The old design is wrong. Use the corrected interface.",
  );
  expect(state.runs[1].prompt).toContain("Continue with the correction above");
  expect(state.tasks[0].status).toBe("in_progress");
});
test("unknown members fail atomically without persisting a comment", async () => {
  const f = await fixture();
  await expect(
    f.coordinator.comment({
      requestId: "bad",
      taskId: f.task.id,
      body: "Oops",
      memberIds: ["missing"],
    }),
  ).rejects.toThrow("成员不存在");
  expect((await f.store.read()).comments).toHaveLength(0);
});
test("a recovered member can submit review despite an older failed attempt", async () => {
  const f = await fixture();
  f.fail();
  await f.coordinator.comment({
    requestId: "first",
    taskId: f.task.id,
    body: "Build",
    memberIds: ["dev"],
  });
  await waitTick(f.coordinator);
  expect((await f.store.read()).tasks[0].status).toBe("blocked");
  f.finish();
  await f.coordinator.comment({
    requestId: "second",
    taskId: f.task.id,
    body: "Fix",
    memberIds: ["dev"],
  });
  await waitTick(f.coordinator);
  expect((await f.store.read()).tasks[0].status).toBe("in_review");
});
test("new discussion cannot change an already submitted creation prompt", async () => {
  const f = await fixture();
  f.lostAck();
  await f.coordinator.comment({
    requestId: "first",
    taskId: f.task.id,
    body: "Build",
    memberIds: ["dev"],
  });
  await vi.waitFor(() => expect(f.create).toHaveBeenCalledTimes(1));
  await f.coordinator.comment({
    requestId: "note",
    taskId: f.task.id,
    body: "Additional discussion",
    memberIds: [],
  });
  await waitTick(f.coordinator);
  expect(f.create).toHaveBeenCalledTimes(2);
  expect(f.create.mock.calls[1][0].prompt).toBe(
    f.create.mock.calls[0][0].prompt,
  );
  expect(f.creations.size).toBe(1);
});

test("finished runs retain readable paged history", async () => {
  const f = await fixture();
  f.finish();
  await f.coordinator.comment({
    requestId: "history",
    taskId: f.task.id,
    body: "Build",
    memberIds: ["dev"],
  });
  await waitTick(f.coordinator);
  const run = (await f.store.read()).runs[0];
  expect(run.status).toBe("completed");
  const cursor = { epoch: "e", seq: 10 };
  const page = await f.coordinator.timeline(run.id, cursor);
  expect(f.refetch).toHaveBeenCalledWith({
    limit: 80,
    direction: "before",
    cursor,
  });
  expect(page.entries[0].item).toEqual({
    type: "assistant_message",
    text: "history",
  });
  expect(page.startCursor).toEqual({ epoch: "e", seq: 9 });
});

test("attachment-only comments persist and creation retries reuse uploaded files", async () => {
  const f = await fixture();
  const file = await f.attachments.upload({
    fileName: "说明.md",
    base64: Buffer.from("中文说明\n# Demo").toString("base64"),
  });
  expect((await f.attachments.read(file.id)).bytes.toString()).toBe(
    "中文说明\n# Demo",
  );
  f.lostAck();
  const input = {
    requestId: "attachment",
    taskId: f.task.id,
    body: "",
    memberIds: ["dev"],
    attachments: [file],
  };
  await f.coordinator.comment(input);
  await waitTick(f.coordinator);
  await f.coordinator.comment(input);
  await waitTick(f.coordinator);
  expect(f.uploadFile).toHaveBeenCalledTimes(1);
  expect(f.create.mock.calls[1][0]).toEqual(f.create.mock.calls[0][0]);
  expect(f.create).toHaveBeenCalledWith(
    expect.objectContaining({
      attachments: [
        expect.objectContaining({ fileName: "说明.md", path: "/uploads/file" }),
      ],
    }),
  );
  expect((await f.store.read()).comments[0].attachments).toEqual([file]);
  expect((await f.store.read()).runs).toHaveLength(1);
  await expect(
    f.coordinator.comment({
      requestId: "forged",
      taskId: f.task.id,
      body: "test",
      memberIds: [],
      attachments: [{ ...file, fileName: "forged.md" }],
    }),
  ).rejects.toThrow("不匹配");
  await expect(
    f.coordinator.comment({
      requestId: "empty",
      taskId: f.task.id,
      body: " ",
      memberIds: [],
    }),
  ).rejects.toThrow("请输入评论");
});

test("attachments reject traversal, invalid image content, oversized and binary text", async () => {
  const f = await fixture();
  for (const [fileName, bytes] of [
    ["../bad.txt", Buffer.from("bad")],
    ["fake.png", Buffer.from("not a png")],
    ["large.md", Buffer.alloc(512 * 1024 + 1, 65)],
    ["binary.txt", Buffer.from([0, 1])],
    ["bad.exe", Buffer.from("exe")],
  ] as const) {
    await expect(
      f.attachments.upload({ fileName, base64: bytes.toString("base64") }),
    ).rejects.toThrow();
  }
});

async function assign(
  f: Awaited<ReturnType<typeof fixture>>,
  requestId: string,
  resumeTask = false,
) {
  return f.coordinator.comment({
    requestId,
    taskId: f.task.id,
    body: requestId,
    memberIds: ["dev"],
    resumeTask,
  });
}

test("completed session is reused, duplicate comments do not send twice, restart retains mapping", async () => {
  const f = await fixture();
  await assign(f, "initial");
  await waitTick(f.coordinator);
  f.finish();
  await f.coordinator.tick();
  await assign(f, "follow-up");
  await waitTick(f.coordinator);
  await assign(f, "follow-up");
  const recovered = new Coordinator(new Store(f.store.path), f.connections);
  await recovered.tick();
  expect(f.creations.size).toBe(1);
  expect(f.send).toHaveBeenCalledTimes(1);
  const state = await f.store.read();
  expect(state.runs.map((r) => r.agentId)).toEqual(["agent-0", "agent-0"]);
  expect(state.runs[1].status).toBe("completed");
  expect(state.comments.filter((c) => c.runId)).toHaveLength(2);
});

test("pause freezes queued work, allows discussion, resumes only explicitly selected work in the same session", async () => {
  const f = await fixture();
  await assign(f, "first");
  await waitTick(f.coordinator);
  await assign(f, "queued-before-pause");
  await waitTick(f.coordinator);
  expect(f.send).not.toHaveBeenCalled();
  await f.coordinator.pause(f.task.id);
  await f.coordinator.tick();
  let state = await f.store.read();
  expect(state.tasks[0].controlState).toBe("paused");
  expect(state.runs.map((r) => r.status)).toEqual(["paused", "paused"]);
  await f.coordinator.comment({
    requestId: "discussion",
    taskId: f.task.id,
    body: "Use the revised design",
    memberIds: [],
  });
  await expect(assign(f, "accidental")).rejects.toThrow("明确选择");
  await assign(f, "continue-corrected", true);
  await waitTick(f.coordinator);
  state = await f.store.read();
  expect(state.tasks[0].controlState).toBeUndefined();
  expect(state.runs.map((r) => r.status)).toEqual([
    "paused",
    "paused",
    "running",
  ]);
  expect(state.runs[2].agentId).toBe(state.runs[0].agentId);
  expect(f.send).toHaveBeenCalledTimes(1);
  expect(f.send.mock.calls[0][1]).toContain("Use the revised design");
  expect(f.creations.size).toBe(1);
});

test("offline interrupt remains pausing and retries after restart without new execution", async () => {
  const f = await fixture();
  await assign(f, "work");
  await waitTick(f.coordinator);
  f.cancel.mockRejectedValueOnce(new Error("offline"));
  await f.coordinator.pause(f.task.id);
  expect((await f.store.read()).tasks[0].controlState).toBe("pausing");
  await expect(assign(f, "too-soon", true)).rejects.toThrow("正在暂停");
  const recovered = new Coordinator(new Store(f.store.path), f.connections);
  await recovered.tick();
  expect((await f.store.read()).tasks[0].controlState).toBe("paused");
  expect(f.cancel).toHaveBeenCalledTimes(2);
  expect(f.creations.size).toBe(1);
});

test("pause during creation persists late mapping then interrupts before reporting paused", async () => {
  const f = await fixture();
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  let entered!: () => void;
  const creating = new Promise<void>((r) => {
    entered = r;
  });
  f.create.mockImplementationOnce(async () => {
    entered();
    await gate;
    return { id: "late-agent" };
  });
  await assign(f, "racing-create");
  await creating;
  const pausing = f.coordinator.pause(f.task.id);
  await vi.waitFor(async () =>
    expect((await f.store.read()).tasks[0].controlState).toBe("pausing"),
  );
  release();
  await pausing;
  const state = await f.store.read();
  expect(state.runs[0].agentId).toBe("late-agent");
  expect(state.runs[0].status).toBe("paused");
  expect(f.cancel).toHaveBeenCalledWith("late-agent");
  expect(state.tasks[0].controlState).toBe("paused");
});

test("lost continuation acknowledgement never blindly resends, then reconciles the timeline receipt", async () => {
  const f = await fixture();
  await assign(f, "initial");
  await waitTick(f.coordinator);
  f.finish();
  await f.coordinator.tick();
  f.send.mockRejectedValueOnce(new Error("lost ack"));
  await assign(f, "second");
  await waitTick(f.coordinator);
  let state = await f.store.read();
  expect(state.runs[1].status).toBe("delivery_unknown");
  expect(f.send).toHaveBeenCalledTimes(1);
  f.refetch.mockResolvedValueOnce({
    entries: [
      {
        seqEnd: 10,
        item: {
          type: "user_message",
          text: "second",
          clientMessageId: `team-tasks:${state.runs[1].id}`,
        },
      },
    ],
    startCursor: { epoch: "e", seq: 10 },
    hasOlder: false,
    error: null,
    agent: null,
  });
  await f.coordinator.tick();
  state = await f.store.read();
  expect(state.runs[1].status).toBe("completed");
  expect(f.send).toHaveBeenCalledTimes(1);
});

test("changing runtime or project directory starts a separate session instead of leaking old context", async () => {
  const f = await fixture();
  await assign(f, "initial");
  await waitTick(f.coordinator);
  f.finish();
  await f.coordinator.tick();
  await f.coordinator.saveMember({
    ...(await f.store.read()).members[0],
    cwd: "C:\\other",
    provider: "codex/other-model",
  });
  await assign(f, "changed-config");
  await waitTick(f.coordinator);
  const state = await f.store.read();
  expect(state.runs[1].previousRunId).toBeUndefined();
  expect(state.runs[1].agentId).not.toBe(state.runs[0].agentId);
  expect(f.send).not.toHaveBeenCalled();
});

test("pause recovers a lost create acknowledgement before cancelling the original runtime", async () => {
  const f = await fixture();
  f.lostAck();
  await assign(f, "lost-create");
  await f.coordinator.tick();
  expect((await f.store.read()).runs[0].agentId).toBeUndefined();
  await f.coordinator.pause(f.task.id);
  expect((await f.store.read()).tasks[0].controlState).toBe("pausing");
  const recovered = new Coordinator(new Store(f.store.path), f.connections);
  await recovered.tick();
  const state = await f.store.read();
  expect(state.tasks[0].controlState).toBe("paused");
  expect(state.runs[0].agentId).toBe("agent-0");
  expect(f.cancel).toHaveBeenCalledWith("agent-0");
  expect(f.creations.size).toBe(1);
});

test("unselected members stay paused after another member finishes", async () => {
  const f = await fixture();
  await f.coordinator.saveMember({
    ...(await f.store.read()).members[0],
    id: "review",
    cwd: "C:\\review",
  });
  await f.coordinator.comment({
    requestId: "both",
    taskId: f.task.id,
    body: "work",
    memberIds: ["dev", "review"],
  });
  await waitTick(f.coordinator);
  await f.coordinator.pause(f.task.id);
  await assign(f, "only-dev", true);
  await waitTick(f.coordinator);
  f.finish();
  await f.coordinator.tick();
  const state = await f.store.read();
  expect(state.runs.findLast((r) => r.member.id === "review")?.status).toBe(
    "paused",
  );
  expect(state.tasks[0].status).toBe("blocked");
  expect(f.send).toHaveBeenCalledTimes(1);
});

test("pause during continuation waits for submission then confirms interruption", async () => {
  const f = await fixture();
  await assign(f, "first");
  await waitTick(f.coordinator);
  await f.coordinator.stop((await f.store.read()).runs[0].id);
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const sending = new Promise<void>((r) => {
    entered = r;
  });
  f.send.mockImplementationOnce(async () => {
    entered();
    await gate;
  });
  await assign(f, "follow-up");
  await sending;
  const pausing = f.coordinator.pause(f.task.id);
  await vi.waitFor(async () =>
    expect((await f.store.read()).tasks[0].controlState).toBe("pausing"),
  );
  release();
  await pausing;
  const state = await f.store.read();
  expect(state.tasks[0].controlState).toBe("paused");
  expect(state.runs[1].status).toBe("paused");
  expect(f.send).toHaveBeenCalledTimes(1);
  expect(f.cancel).toHaveBeenCalledTimes(2);
});

test("board status does not resume paused work and completion requires confirmed interruption", async () => {
  const f = await fixture();
  await assign(f, "work");
  await waitTick(f.coordinator);
  await expect(f.coordinator.setStatus(f.task.id, "done")).rejects.toThrow(
    "确认暂停",
  );
  await f.coordinator.pause(f.task.id);
  await f.coordinator.setStatus(f.task.id, "in_progress");
  await f.coordinator.tick();
  expect((await f.store.read()).tasks[0].controlState).toBe("paused");
  await f.coordinator.setStatus(f.task.id, "done");
  const s = await f.store.read();
  expect(s.tasks[0].controlState).toBeUndefined();
  expect(s.runs[0].status).toBe("paused");
  await expect(assign(f, "after-done", true)).rejects.toThrow("重新打开");
});
