import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { stateSchema, type State } from "../shared/contracts";

export const emptyState = (): State => ({
  version: 1,
  hosts: [{ id: "local", name: "当前 Host", local: true }],
  members: [],
  projects: [],
  tasks: [],
  comments: [],
  runs: [],
});

/** One writer owns this file; every mutation commits atomically before dispatch. */
export class Store {
  private tail: Promise<unknown> = Promise.resolve();
  constructor(readonly path: string) {}
  async read(): Promise<State> {
    await this.tail;
    return this.load();
  }
  private async load(): Promise<State> {
    try {
      return stateSchema.parse(JSON.parse(await readFile(this.path, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return emptyState();
      throw error;
    }
  }
  mutate<T>(change: (state: State) => T): Promise<T> {
    const job = this.tail.then(async () => {
      const state = await this.load();
      const result = change(state);
      stateSchema.parse(state);
      await mkdir(dirname(this.path), { recursive: true });
      const temp = `${this.path}.${randomUUID()}.tmp`;
      await writeFile(temp, JSON.stringify(state, null, 2), { mode: 0o600 });
      await rename(temp, this.path);
      return result;
    });
    this.tail = job.catch(() => {});
    return job;
  }
}
