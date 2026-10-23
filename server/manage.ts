import { readFile } from "node:fs/promises";
import type { PluginRpcContract } from "@getpaseo/plugin";
import { Connections } from "./connections";
import {
  snapshotRpc,
  createTaskRpc,
  commentRpc,
  timelineRpc,
  stopRpc,
  pauseTaskRpc,
  statusRpc,
  memberRpc,
  projectRpc,
  taskStatus,
} from "../shared/contracts";

const [command, arg, value] = process.argv.slice(2);
async function callPluginRpc(
  contract: PluginRpcContract,
  invoke: (method: string, input: unknown) => Promise<unknown>,
  input: unknown,
) {
  return contract.output.parse(
    await invoke(contract.name, contract.input.parse(input)),
  );
}
if (!command || command === "help") {
  console.log(
    "npm run team -- snapshot | create <input.json> | comment <input.json> | member <input.json> | project <input.json> | timeline <runId> | stop <runId> | pause <taskId> | status <taskId> <status>",
  );
} else {
  const connections = new Connections();
  try {
    const { driver } = await connections.get("local");
    const invoke = (method: string, input: unknown) =>
      driver.invokePluginRpc("paseo-team-tasks", method, input);
    const readInput = async () => {
      if (!arg) throw new Error("缺少 JSON 文件路径");
      return JSON.parse(await readFile(arg, "utf8"));
    };
    let result: unknown;
    switch (command) {
      case "snapshot":
        result = await callPluginRpc(snapshotRpc, invoke, {});
        break;
      case "create":
        result = await callPluginRpc(createTaskRpc, invoke, await readInput());
        break;
      case "comment":
        result = await callPluginRpc(commentRpc, invoke, await readInput());
        break;
      case "member":
        result = await callPluginRpc(memberRpc, invoke, await readInput());
        break;
      case "project":
        result = await callPluginRpc(projectRpc, invoke, await readInput());
        break;
      case "timeline":
        result = await callPluginRpc(timelineRpc, invoke, { runId: arg });
        break;
      case "stop":
        result = await callPluginRpc(stopRpc, invoke, { runId: arg });
        break;
      case "pause":
        result = await callPluginRpc(pauseTaskRpc, invoke, { taskId: arg });
        break;
      case "status":
        result = await callPluginRpc(statusRpc, invoke, {
          taskId: arg,
          status: taskStatus.parse(value),
        });
        break;
      default:
        throw new Error("未知命令，运行 npm run team -- help 查看帮助");
    }
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await connections.close();
  }
}
