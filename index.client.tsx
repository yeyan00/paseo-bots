import type {
  PluginClientContext,
  PluginSidebarItemProps,
} from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { TeamScreen } from "./client/team-screen";

function TeamItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
  return (
    <SidebarRow
      icon="Users"
      active={currentScreen?.screenId === "tasks"}
      onPress={() => openScreen({ screenId: "tasks" })}
    />
  );
}
export default function contribute(client: PluginClientContext) {
  client.addScreen({ id: "tasks", title: "team bots", Component: TeamScreen });
  client.addSidebarHeaderItem({
    id: "team",
    title: "team bots",
    Component: TeamItem,
  });
  client.addCommandCenterItem({
    id: "tasks",
    title: "team bots",
    icon: "Users",
    context: "global",
    keywords: ["team", "bots", "task", "协作", "任务"],
    onSelect: ({ openScreen }) => openScreen({ screenId: "tasks" }),
  });
  return () => {};
}
