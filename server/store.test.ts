import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { Store } from "./store";
import { english, resolveLanguage, translate } from "../client/translations";
import { preferences } from "../shared/preferences";
import ts from "typescript";
import { URL } from "node:url";

const dirs: string[] = [];
test("all Chinese UI copy goes through the translator", async () => {
  const unlocalized: string[] = [];
  for (const file of [
    "team-screen.tsx",
    "comment-composer.tsx",
    "comment-attachments.tsx",
    "host-project-picker.tsx",
    "event-row.tsx",
  ]) {
    const source = await readFile(
      new URL(`../client/${file}`, import.meta.url),
      "utf8",
    );
    const ast = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const visit = (node: ts.Node) => {
      if (
        (ts.isStringLiteral(node) ||
          ts.isJsxText(node) ||
          ts.isNoSubstitutionTemplateLiteral(node)) &&
        /\p{Script=Han}/u.test(node.text)
      ) {
        const parent = ts.isConditionalExpression(node.parent)
          ? node.parent.parent
          : node.parent;
        if (
          !ts.isCallExpression(parent) ||
          parent.expression.getText(ast) !== "t"
        )
          unlocalized.push(`${file}: ${node.text}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(ast);
  }
  expect(unlocalized).toEqual([]);
});
test("plugin language defaults, fallbacks and placeholders preserve user content", () => {
  expect(preferences.schema.parse({}).language).toBe("system");
  expect(resolveLanguage("system", "zh-CN")).toBe("zh-CN");
  expect(resolveLanguage("system", "zh-TW")).toBe("zh-CN");
  expect(resolveLanguage("system", "fr-FR")).toBe("en");
  expect(resolveLanguage("en", "zh-CN")).toBe("en");
  expect(resolveLanguage("zh-CN", "en-US")).toBe("zh-CN");
  expect(translate("en", "编辑成员 {0}", { 0: "中文成员 {1}" })).toBe(
    "Edit member 中文成员 {1}",
  );
  expect(translate("zh-CN", "编辑成员 {0}", { 0: "My agent" })).toBe(
    "编辑成员 My agent",
  );
  for (const [key, value] of Object.entries(english)) {
    expect(value.trim().length).toBeGreaterThan(0);
    expect(value).not.toMatch(/\p{Script=Han}/u);
    expect([...value.matchAll(/\{\d+\}/g)].map((m) => m[0]).sort()).toEqual(
      [...key.matchAll(/\{\d+\}/g)].map((m) => m[0]).sort(),
    );
  }
});
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
test("concurrent mutations survive a new store instance without lost writes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "team-store-"));
  dirs.push(dir);
  const path = join(dir, "state.json"),
    store = new Store(path);
  await Promise.all(
    Array.from({ length: 15 }, (_, index) =>
      store.mutate((s) => {
        s.tasks.push({
          id: `${index}`,
          title: `${index}`,
          description: "",
          status: "todo",
          createdAt: new Date().toISOString(),
        });
      }),
    ),
  );
  expect((await new Store(path).read()).tasks).toHaveLength(15);
});
test("corrupt data fails closed instead of overwriting task history", async () => {
  const dir = await mkdtemp(join(tmpdir(), "team-store-"));
  dirs.push(dir);
  const path = join(dir, "state.json");
  await writeFile(path, "{corrupt");
  const store = new Store(path);
  await expect(store.mutate((s) => s.tasks.splice(0))).rejects.toThrow();
  expect(await readFile(path, "utf8")).toBe("{corrupt");
});
