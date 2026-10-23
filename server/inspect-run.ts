import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Connections } from "./connections";
import { stateSchema } from "../shared/contracts";
const connections = new Connections();
try {
  const local = await connections.get("local");
  const state = stateSchema.parse(
    await local.driver.invokePluginRpc("paseo-team-tasks", "team.snapshot", {}),
  );
  const smoke = JSON.parse(
    await readFile(join(process.cwd(), "evidence", "smoke-task.json"), "utf8"),
  );
  for (const run of state.runs.filter(
    (r) =>
      r.taskId === smoke.taskId &&
      r.agentId &&
      r.status !== "failed" &&
      (process.argv[2] !== "approve" || r.id === process.argv[3]) &&
      (process.argv[2] !== "pending" || r.status === "permission"),
  )) {
    const host = await connections.get(run.member.hostId);
    const agent = host.api.agents.ref(run.agentId as string);
    await agent.refresh();
    console.log(
      JSON.stringify(
        {
          runId: run.id,
          host: run.member.hostId,
          status: agent.status,
          permissions: agent.pendingPermissions,
          error: agent.lastError,
        },
        null,
        2,
      ),
    );
    if (process.argv[2] === "timeline")
      console.log(
        JSON.stringify(
          (await agent.timeline.refetch({ limit: 8 })).entries.map(
            (e) => e.item,
          ),
          null,
          2,
        ),
      );
    if (
      process.argv[2] === "approve" &&
      process.argv[3] === run.id &&
      process.argv[4]
    ) {
      await agent.respondToPermission({
        requestId: process.argv[4],
        response: { behavior: "allow" },
      });
      console.log("已批准所选请求。");
    }
  }
} finally {
  await connections.close();
}
