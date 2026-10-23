import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const taskStatus = z.enum([
  "todo",
  "in_progress",
  "blocked",
  "in_review",
  "done",
]);
export const memberSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  name: z.string().min(1).max(100),
  hostId: z.string().min(1),
  provider: z.string().min(1),
  cwd: z.string().min(1),
  instructions: z.string().max(20000).default(""),
});
export type Member = z.infer<typeof memberSchema>;
export const projectSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  name: z.string().min(1).max(100),
  paths: z.record(z.string(), z.string().min(1)),
  hostProjects: z.record(z.string(), z.string().min(1)).optional(),
});
export type Project = z.infer<typeof projectSchema>;
export const hostSchema = z.object({
  id: z.string(),
  name: z.string(),
  local: z.boolean(),
});
export const taskSchema = z.object({
  id: z.string(),
  projectId: z.string().optional(),
  title: z.string(),
  description: z.string(),
  status: taskStatus,
  controlState: z.enum(["pausing", "paused"]).optional(),
  createdAt: z.string(),
});
export type Task = z.infer<typeof taskSchema>;
export const attachmentSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{64}$/),
  fileName: z.string().min(1).max(160),
  mimeType: z.string(),
  size: z
    .number()
    .int()
    .min(1)
    .max(512 * 1024),
});
export type Attachment = z.infer<typeof attachmentSchema>;
export const uploadAttachmentRpc = defineRpc({
  name: "team.attachment.upload",
  input: z.object({
    fileName: z.string().min(1).max(160),
    base64: z.string().min(4).max(700000),
  }),
  output: attachmentSchema,
});
export const readAttachmentRpc = defineRpc({
  name: "team.attachment.read",
  input: z.object({ id: attachmentSchema.shape.id }),
  output: z.object({ base64: z.string() }),
});
export const commentSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  requestId: z.string(),
  author: z.string(),
  body: z.string(),
  memberIds: z.array(z.string()),
  createdAt: z.string(),
  runId: z.string().optional(),
  attachments: z.array(attachmentSchema).max(4).optional(),
});
export const runSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  commentId: z.string(),
  member: memberSchema,
  status: z.enum([
    "queued",
    "starting",
    "running",
    "permission",
    "completed",
    "failed",
    "cancelled",
    "paused",
    "delivery_unknown",
  ]),
  previousRunId: z.string().optional(),
  stopRequested: z.enum(["pause", "cancel"]).optional(),
  submissionAttempted: z.boolean().optional(),
  messageAccepted: z.boolean().optional(),
  agentId: z.string().optional(),
  prompt: z.string().optional(),
  uploadedFiles: z
    .array(
      z.object({
        type: z.literal("uploaded_file"),
        id: z.string(),
        fileName: z.string(),
        mimeType: z.string(),
        size: z.number(),
        path: z.string(),
      }),
    )
    .optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  result: z.string().default(""),
  error: z.string().optional(),
});
export type Run = z.infer<typeof runSchema>;
export const stateSchema = z.object({
  version: z.literal(1),
  hosts: z.array(hostSchema),
  members: z.array(memberSchema),
  projects: z.array(projectSchema).default([]),
  tasks: z.array(taskSchema),
  comments: z.array(commentSchema),
  runs: z.array(runSchema),
});
export type State = z.infer<typeof stateSchema>;
export const snapshotRpc = defineRpc({
  name: "team.snapshot",
  input: z.object({}),
  output: stateSchema,
});
export const createTaskRpc = defineRpc({
  name: "team.task.create",
  input: z.object({
    requestId: z.string().min(1).max(100),
    title: z.string().min(1).max(200),
    projectId: z.string().optional(),
    description: z.string().max(30000),
  }),
  output: taskSchema,
});
export const statusRpc = defineRpc({
  name: "team.task.status",
  input: z.object({ taskId: z.string(), status: taskStatus }),
  output: z.boolean(),
});
export const commentRpc = defineRpc({
  name: "team.comment.create",
  input: z.object({
    requestId: z.string().min(1).max(100),
    taskId: z.string(),
    body: z.string().max(30000),
    memberIds: z.array(z.string()).max(8),
    attachments: z.array(attachmentSchema).max(4).optional(),
    resumeTask: z.boolean().optional(),
  }),
  output: z.string(),
});
export const memberRpc = defineRpc({
  name: "team.member.save",
  input: memberSchema,
  output: z.boolean(),
});
export const projectRpc = defineRpc({
  name: "team.project.save",
  input: projectSchema,
  output: z.boolean(),
});
export const hostProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
});
export type HostProject = z.infer<typeof hostProjectSchema>;
export const hostProjectsRpc = defineRpc({
  name: "team.host.projects",
  input: z.object({ hostId: z.string() }),
  output: z.array(hostProjectSchema),
});
export const addHostProjectRpc = defineRpc({
  name: "team.host.project.add",
  input: z.object({
    hostId: z.string(),
    path: z.string().min(1),
    name: z.string().trim().min(1).max(100),
    createDirectory: z.boolean(),
  }),
  output: hostProjectSchema,
});
export const browseDirectoriesRpc = defineRpc({
  name: "team.host.directories",
  input: z.object({ hostId: z.string(), path: z.string().min(1) }),
  output: z.object({
    path: z.string(),
    parent: z.string(),
    entries: z.array(z.object({ name: z.string(), path: z.string() })),
  }),
});
export const modelsRpc = defineRpc({
  name: "team.host.models",
  input: z.object({
    hostId: z.string(),
    provider: z.string(),
    cwd: z.string(),
  }),
  output: z.object({
    models: z.array(z.object({ id: z.string(), name: z.string() })),
  }),
});
export const runtimesRpc = defineRpc({
  name: "team.host.runtimes",
  input: z.object({ hostId: z.string() }),
  output: z.array(z.object({ provider: z.string(), available: z.boolean() })),
});
export const hostRpc = defineRpc({
  name: "team.host.save",
  input: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    pairingUrl: z.string().min(1),
  }),
  output: hostSchema,
});
export const inspectRpc = defineRpc({
  name: "team.host.inspect",
  input: z.object({ hostId: z.string() }),
  output: z.object({ providers: z.unknown() }),
});
export const timelineRpc = defineRpc({
  name: "team.run.timeline",
  input: z.object({
    runId: z.string(),
    cursor: z.object({ epoch: z.string(), seq: z.number() }).optional(),
  }),
  output: z.object({
    permissions: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        kind: z.string(),
        input: z.unknown(),
      }),
    ),
    entries: z.array(z.object({ seq: z.number(), item: z.unknown() })),
    hasOlder: z.boolean(),
    startCursor: z.object({ epoch: z.string(), seq: z.number() }).nullable(),
  }),
});
export const permissionRpc = defineRpc({
  name: "team.run.permission",
  input: z.object({
    runId: z.string(),
    requestId: z.string(),
    allow: z.boolean(),
  }),
  output: z.boolean(),
});
export const stopRpc = defineRpc({
  name: "team.run.stop",
  input: z.object({ runId: z.string() }),
  output: z.boolean(),
});
export const pauseTaskRpc = defineRpc({
  name: "team.task.pause",
  input: z.object({ taskId: z.string() }),
  output: z.boolean(),
});
