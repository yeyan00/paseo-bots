import { Connections } from "./connections";

const connections = new Connections();
try {
  const defs = [
    { id: "local", name: "当前 Host" },
    ...(await connections.definitions()),
  ];
  for (const host of defs) {
    try {
      const { api } = await connections.get(host.id);
      const providers = await api.providers.listAvailable();
      console.log(
        JSON.stringify(
          { hostId: host.id, name: host.name, providers },
          null,
          2,
        ),
      );
      if (process.argv.includes("--models")) {
        const catalogue = await api.providers.listModels("codex");
        const agents = await api.agents.list({});
        console.log(
          JSON.stringify(
            {
              host: host.name,
              models: catalogue.models?.map((m) => ({
                id: m.id,
                default: m.isDefault,
              })),
              agentModels: agents.entries.slice(0, 12).map((a) => ({
                provider: a.agent.provider,
                model: a.agent.model,
                status: a.agent.status,
              })),
            },
            null,
            2,
          ),
        );
      }
    } catch (error) {
      console.error(
        JSON.stringify({
          name: host.name,
          error: error instanceof Error ? error.message : "连接失败",
        }),
      );
    }
  }
} finally {
  await connections.close();
}
