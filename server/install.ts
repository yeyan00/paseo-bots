import { resolve } from "node:path";
import { Connections } from "./connections";
const connections = new Connections();
try {
  const { api, driver } = await connections.get("local");
  const config = await api.config.get();
  if (!config.config.pluginsEnabled)
    throw new Error("插件总开关未启用，需要用户先启用插件");
  const installed = (await driver.listPlugins()).find(
    (p) => p.id === "paseo-team-tasks",
  );
  const result = installed
    ? await driver.reloadPlugin(installed.id)
    : await driver.installDirectoryPlugin(resolve("."));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await connections.close();
}
