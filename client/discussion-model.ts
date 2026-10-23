import type { Run, State } from "../shared/contracts";

export const isActiveRun = (run: Run) =>
  ["queued", "starting", "running", "permission", "delivery_unknown"].includes(
    run.status,
  );

export type DiscussionEntry =
  | { kind: "comment"; comment: State["comments"][number] }
  | { kind: "run"; run: Run };

/** Runs stay beside their trigger; result comments retain completion order. */
export function discussionEntries(
  state: State,
  taskId: string,
): DiscussionEntry[] {
  const runs = state.runs.filter((r) => r.taskId === taskId);
  const comments = state.comments.filter((c) => c.taskId === taskId);
  const entries: DiscussionEntry[] = [];
  for (const comment of comments) {
    entries.push({ kind: "comment", comment });
    for (const run of runs.filter((r) => r.commentId === comment.id))
      entries.push({ kind: "run", run });
  }
  for (const run of runs.filter(
    (r) => !comments.some((c) => c.id === r.commentId),
  ))
    entries.push({ kind: "run", run });
  return entries;
}

export function latestMemberRuns(runs: Run[]) {
  return [...new Map(runs.map((run) => [run.member.id, run])).values()];
}
