import { ClassicLevel } from "classic-level";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Connections, dataDir } from "./connections";
import { Store } from "./store";

const connections = new Connections();

// Read a snapshot, never open Chromium's live LevelDB for writing.
const dir = await mkdtemp(join(tmpdir(), "paseo-host-import-"));
try {
  await cp(
    join(process.env.APPDATA ?? "", "Paseo", "Local Storage", "leveldb"),
    dir,
    { recursive: true },
  );
  const db = new ClassicLevel<Buffer, Buffer>(dir, {
    keyEncoding: "buffer",
    valueEncoding: "buffer",
  });
  try {
    for await (const [key, value] of db.iterator()) {
      const k = key.toString("utf8");
      if (!k.includes("daemon-registry")) continue;
      const text =
        value[0] === 1
          ? value.subarray(1).toString("latin1")
          : value[0] === 0
            ? value.subarray(1).toString("utf16le")
            : value.toString("utf8");
      const hosts = JSON.parse(text);
      const host = hosts.find(
        (h: { label: string }) => h.label === "deeplearning",
      );
      if (!host) throw new Error("桌面客户端未配对 deeplearning");
      const relay = host.connections.find(
        (c: { type: string }) => c.type === "relay",
      );
      if (!relay) throw new Error("deeplearning 没有 Relay 连接");
      const offer = {
        v: 2,
        serverId: host.serverId,
        daemonPublicKeyB64: relay.daemonPublicKeyB64,
        relay: { endpoint: relay.relayEndpoint, useTls: relay.useTls ?? true },
      };
      const url = `https://app.paseo.sh/#offer=${Buffer.from(JSON.stringify(offer)).toString("base64url")}`;
      const saved = await connections.saveOffer(host.serverId, host.label, url);
      const local = await connections.get("local");
      // Use the installed writer if present; otherwise bootstrap before installation.
      const installed = (await local.driver.listPlugins()).some(
        (p) => p.id === "paseo-team-tasks",
      );
      if (installed)
        await local.driver.invokePluginRpc(
          "paseo-team-tasks",
          "team.host.save",
          { id: saved.id, name: saved.name, pairingUrl: url },
        );
      else
        await new Store(join(dataDir, "state.json")).mutate((s) => {
          s.hosts = s.hosts.filter((h) => h.id !== saved.id).concat(saved);
        });
      console.log(JSON.stringify({ imported: saved.name, hostId: saved.id }));
    }
  } finally {
    await db.close();
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}
try {
  const local = await connections.get("local");
  console.log(
    JSON.stringify(
      {
        plugins: (await local.driver.listPlugins()).map((p) => ({
          id: p.id,
          status: p.status,
        })),
      },
      null,
      2,
    ),
  );
} finally {
  await connections.close();
  await rm(join(dataDir, "desktop-registry.local.json"), { force: true });
}
