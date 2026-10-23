import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { Connections } from "./connections";
import { stateSchema, taskSchema } from "../shared/contracts";

// Uses the running plugin's RPCs: never opens a second state writer.
const connections = new Connections();
const evidence = join(process.cwd(), "evidence");
try {
  await mkdir(evidence, { recursive: true });
  const local = await connections.get("local");
  const rpc = (method: string, input: unknown) =>
    local.driver.invokePluginRpc("paseo-team-tasks", method, input);
  const command = process.argv[2] ?? "start";
  if (command === "start") {
    const state = stateSchema.parse(await rpc("team.snapshot", {}));
    const remote = state.hosts.find((h) => h.name === "deeplearning");
    if (!remote) throw new Error("deeplearning 未接入");
    await rpc("team.member.save", {
      id: "local-dev",
      name: "本机开发",
      hostId: "local",
      provider: "codex",
      cwd: "C:\\test",
      instructions: "负责 CLI、集成与验收。",
    });
    await rpc("team.member.save", {
      id: "remote-dev",
      name: "deeplearning 开发",
      hostId: remote.id,
      provider: "codex",
      cwd: "/data2/gv_data/workspace/mzm/test",
      instructions: "负责统计核心与单元测试。",
    });
    const task = taskSchema.parse(
      await rpc("team.task.create", {
        requestId: `smoke-${Date.now()}`,
        title: "双 Host 协作：开发任务统计 CLI",
        description: [
          "开发一个零依赖 Node.js ESM 任务统计工具。两台 Host 都在各自指定测试目录下新建 team-task-demo 子目录，保留已有文件。",
          "接口：stats.mjs 导出 summarize(tasks)。输入数组每项为 {title: string, status: 'todo'|'doing'|'done'}。",
          "返回 {total, todo, doing, done, completionRate}，completionRate 为 0..100、四舍五入的整数百分比；空数组为 0。非法输入抛 TypeError。",
          "本机成员实现 CLI cli.mjs（读取命令行指定的 JSON 文件，调用 summarize，打印 JSON），编写集成测试、样例与 README。",
          "远端成员实现 stats.mjs 和 node:test 单元测试。两个成员首轮并行；核心模块完成后，由主控通过 Paseo 文件 API 取回，集成本机再运行全部测试。",
          "验收：远端单元测试、本机集成测试、CLI 真实输出全部通过。",
        ].join("\n"),
      }),
    );
    await writeFile(
      join(evidence, "smoke-task.json"),
      JSON.stringify({ taskId: task.id, remoteId: remote.id }, null, 2),
    );
    await rpc("team.comment.create", {
      requestId: `${task.id}-local`,
      taskId: task.id,
      memberIds: ["local-dev"],
      body: "请先实现你负责的 CLI cli.mjs、integration.test.mjs、sample.json 和 README，放入 C:\\test\\team-task-demo。CLI import './stats.mjs'，但首轮不要创建 stats.mjs，等待远端核心模块集成。先检查 CLI 语法并报告；不要自行实现核心。完成后结束回合。",
    });
    await rpc("team.comment.create", {
      requestId: `${task.id}-remote`,
      taskId: task.id,
      memberIds: ["remote-dev"],
      body: "请实现 stats.mjs 和 stats.test.mjs，放入 /data2/gv_data/workspace/mzm/test/team-task-demo。严格按总任务接口验证每项 title/status，编写 node:test 覆盖空数组、三种状态、百分比四舍五入及非法输入。运行 node --test stats.test.mjs，报告结果和文件路径。完成后结束回合。",
    });
    console.log(JSON.stringify({ taskId: task.id, status: "dispatched" }));
  } else {
    const run = JSON.parse(
      await readFile(join(evidence, "smoke-task.json"), "utf8"),
    );
    const state = stateSchema.parse(await rpc("team.snapshot", {}));
    const runs = state.runs.filter((r) => r.taskId === run.taskId);
    if (command === "retry") {
      for (const member of state.members)
        await rpc("team.member.save", {
          ...member,
          provider: "codex/gv4/gpt-6.1-sol",
        });
      for (const memberId of ["local-dev", "remote-dev"]) {
        const original = state.comments.find(
          (c) => c.taskId === run.taskId && c.memberIds.includes(memberId),
        );
        if (!original) throw new Error("首轮指派不存在");
        await rpc("team.comment.create", {
          requestId: `${run.taskId}-retry-${memberId}`,
          taskId: run.taskId,
          body: `模型配置已改为现有会话使用的模型。重新执行：\n${original.body}`,
          memberIds: [memberId],
        });
      }
      console.log("已使用现有网关模型重新派发。");
    } else if (command === "verify") {
      const latest = [...new Map(runs.map((r) => [r.member.id, r])).values()];
      if (latest.some((r) => r.status !== "completed"))
        throw new Error("验收回合尚未结束");
      const outputs: Record<string, string[]> = {};
      for (const r of latest) {
        const host = await connections.get(r.member.hostId);
        const page = await host.api.agents
          .ref(r.agentId as string)
          .timeline.refetch({ limit: 80 });
        await writeFile(
          join(evidence, `${r.member.id}-timeline.json`),
          JSON.stringify(page.entries, null, 2),
        );
        outputs[r.member.id] = page.entries.flatMap((e) =>
          e.item.type === "tool_call" &&
          e.item.detail?.type === "shell" &&
          e.item.detail.exitCode === 0
            ? [e.item.detail.output ?? ""]
            : [],
        );
      }
      const integrated = outputs["local-dev"].join("\n");
      if (
        !/tests\s+14/.test(integrated) ||
        !/pass\s+14/.test(integrated) ||
        !/fail\s+0/.test(integrated)
      )
        throw new Error("本机原始工具输出中未找到 14 项测试通过证据");
      const expected = {
        total: 3,
        todo: 1,
        doing: 1,
        done: 1,
        completionRate: 33,
      };
      if (!integrated.includes(JSON.stringify(expected)))
        throw new Error("CLI 实际输出不符合预期");
      const remote = await connections.get(run.remoteId);
      const hashes: Record<string, string> = {};
      for (const file of ["stats.mjs", "stats.test.mjs"]) {
        const remoteFile = await remote.driver.readFile(
          "/data2/gv_data/workspace/mzm/test",
          `team-task-demo/${file}`,
        );
        const localFile = await readFile(
          join("C:\\test\\team-task-demo", file),
        );
        const hash = (bytes: Uint8Array) =>
          createHash("sha256").update(bytes).digest("hex");
        if (hash(remoteFile.bytes) !== hash(localFile))
          throw new Error(`远端产物与本机集成文件不一致: ${file}`);
        hashes[file] = hash(localFile);
      }
      const report = {
        taskId: run.taskId,
        verifiedAt: new Date().toISOString(),
        tests: 14,
        passed: 14,
        failed: 0,
        cli: expected,
        hashes,
      };
      await writeFile(
        join(evidence, "verification.json"),
        JSON.stringify(report, null, 2),
      );
      console.log(JSON.stringify(report, null, 2));
    } else if (command === "integrate") {
      const latest = new Map(runs.map((r) => [r.member.id, r]));
      if ([...latest.values()].some((r) => r.status !== "completed"))
        throw new Error("先等待首轮两个成员完成");
      const remote = await connections.get(run.remoteId);
      const files = ["stats.mjs", "stats.test.mjs"];
      for (const file of files) {
        const content = await remote.driver.readFile(
          "/data2/gv_data/workspace/mzm/test",
          `team-task-demo/${file}`,
        );
        const text = Buffer.from(content.bytes).toString("utf8");
        // The agreed test directory is local; refuse to overwrite an existing different artifact.
        const path = join("C:\\test\\team-task-demo", file);
        try {
          const existing = await readFile(path, "utf8");
          if (existing !== text)
            throw new Error(`集成目标已存在不同内容: ${file}`);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          await writeFile(path, text);
        }
      }
      await rpc("team.comment.create", {
        requestId: `${run.taskId}-integrate`,
        taskId: run.taskId,
        memberIds: ["local-dev"],
        body: "主控已通过 Paseo 的文件 API 从 deeplearning 拉取真实 stats.mjs 和 stats.test.mjs，放入本机 team-task-demo。请检查并修复集成问题（保留远端核心逻辑），运行 node --test stats.test.mjs integration.test.mjs，然后运行 node cli.mjs sample.json，把真实测试计数及 CLI JSON 输出写入 verification.md。不要仅凭其他成员报告判断成功。",
      });
      console.log("核心文件已取回，集成验收任务已派发。");
    } else {
      console.log(
        JSON.stringify(
          {
            task: state.tasks.find((t) => t.id === run.taskId),
            runs,
            comments: state.comments.filter((c) => c.taskId === run.taskId),
          },
          null,
          2,
        ),
      );
      await writeFile(
        join(evidence, "smoke-state.json"),
        JSON.stringify(state, null, 2),
      );
    }
  }
} finally {
  await connections.close();
}
