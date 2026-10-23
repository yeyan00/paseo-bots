import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { WebSocket } from "ws";
import {
  DaemonClient,
  type WebSocketLike,
} from "@getpaseo/client/internal/daemon-client";
import { createPaseoApi, type PaseoApi } from "@getpaseo/client";
import { parseConnectionOfferFromUrl } from "@getpaseo/protocol/connection-offer";
import { buildRelayWebSocketUrl } from "@getpaseo/protocol/daemon-endpoints";

export const dataDir =
  process.env.PASEO_TEAM_HOME ??
  join(process.env.PASEO_HOME ?? join(homedir(), ".paseo"), "team-tasks");
const connectionSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  password: z.string().optional(),
  daemonPublicKeyB64: z.string().optional(),
  serverId: z.string().optional(),
});
export type HostConnection = z.infer<typeof connectionSchema>;
const connectionFile = join(dataDir, "connections.json");

export interface Connection {
  api: PaseoApi;
  driver: DaemonClient;
  close(): Promise<void>;
}
export class Connections {
  private cache = new Map<string, Promise<Connection>>();
  async definitions(): Promise<HostConnection[]> {
    try {
      return z
        .array(connectionSchema)
        .parse(JSON.parse(await readFile(connectionFile, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }
  async saveOffer(id: string, name: string, pairingUrl: string) {
    if (id === "local") throw new Error("本机连接不能被替换");
    const offer = parseConnectionOfferFromUrl(pairingUrl);
    if (!offer || offer.serverId !== id)
      throw new Error("Host ID 必须与配对链接一致");
    const def: HostConnection = {
      id,
      name,
      serverId: offer.serverId,
      daemonPublicKeyB64: offer.daemonPublicKeyB64,
      url: buildRelayWebSocketUrl({
        endpoint: offer.relay.endpoint,
        serverId: offer.serverId,
        role: "client",
        useTls: offer.relay.useTls ?? true,
      }),
    };
    // Probe before persisting, never replace working authorization with an invalid offer.
    const probe = await this.connect(def);
    await probe.close();
    const defs = await this.definitions();
    const next = defs.filter((x) => x.id !== id).concat(def);
    await mkdir(dataDir, { recursive: true });
    const temp = `${connectionFile}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(next, null, 2), { mode: 0o600 });
    await rename(temp, connectionFile);
    await this.evict(id);
    return { id, name, local: false };
  }
  async get(id: string): Promise<Connection> {
    let pending = this.cache.get(id);
    if (!pending) {
      pending = (async () => {
        if (id === "local") {
          const home = process.env.PASEO_HOME ?? join(homedir(), ".paseo");
          const config = JSON.parse(
            await readFile(join(home, "config.json"), "utf8"),
          );
          const listen = config.daemon?.listen ?? "127.0.0.1:6767";
          return this.connect(
            { id, name: "当前 Host", url: `ws://${listen}/ws` },
            async () =>
              (await readFile(join(home, "local-credential"), "utf8")).trim(),
          );
        }
        const def = (await this.definitions()).find((x) => x.id === id);
        if (!def) throw new Error("执行节点未授权，请添加配对链接");
        return this.connect(def);
      })();
      this.cache.set(id, pending);
      pending.catch(() => {
        if (this.cache.get(id) === pending) this.cache.delete(id);
      });
    }
    return pending;
  }
  private async connect(
    def: HostConnection,
    credential?: () => Promise<string>,
  ): Promise<Connection> {
    const driver = new DaemonClient({
      url: def.url,
      clientId: `team-tasks-${def.id}`,
      clientType: "cli",
      appVersion: "0.11.4",
      password: def.password,
      localCredential: credential,
      e2ee: def.daemonPublicKeyB64
        ? { enabled: true, daemonPublicKeyB64: def.daemonPublicKeyB64 }
        : undefined,
      webSocketFactory: (url, options) =>
        new WebSocket(url, options?.protocols, {
          headers: options?.headers,
        }) as unknown as WebSocketLike,
      reconnect: { enabled: true, baseDelayMs: 1000, maxDelayMs: 15000 },
      connectTimeoutMs: 15000,
      logger: { debug() {}, info() {}, warn() {}, error() {} },
    });
    const api = createPaseoApi(driver);
    const close = async () => {
      await api.dispose();
      await driver.close();
    };
    try {
      await driver.connect();
      return { api, driver, close };
    } catch (error) {
      await close();
      throw error;
    }
  }
  async evict(id: string) {
    const pending = this.cache.get(id);
    this.cache.delete(id);
    if (pending) await pending.then((x) => x.close()).catch(() => {});
  }
  async close() {
    await Promise.all([...this.cache.keys()].map((id) => this.evict(id)));
  }
}
