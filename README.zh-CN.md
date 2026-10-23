# team bots

安装在主 Host 的多主机协作插件。手机连接主 Host 后，从侧栏「team bots」进入看板；主 Host 后台连接其他 Paseo daemon，派发 Agent，收集执行过程和最终回复。手机退出后，后台继续跟踪。

侧栏入口现统一命名为 **team bots**。插件顶部「Language / 语言」支持跟随系统、English、简体中文，覆盖看板、成员/节点/项目管理、会话、权限及评论附件界面；日期随插件语言显示。跟随系统时中文系统使用简体中文，其他系统使用英文。语言选项保存在此 Host 的插件设置中，连接同一 Host 的客户端共享该选项；选择跟随系统时各客户端独立判断系统语言。当前 SDK 不提供客户端的手动语言偏好，因此不宣称跟随 Paseo App 语言。任务、评论、成员和项目名称、路径、Agent/工具输出及原始服务端错误保留原文。

## 当前实验配置

| 成员              | Host         | 目录                                | Provider / Model        |
| ----------------- | ------------ | ----------------------------------- | ----------------------- |
| 本机开发          | 当前 Host    | `C:\test`                           | `codex/gv4/gpt-6.1-sol` |
| deeplearning 开发 | deeplearning | `/data2/gv_data/workspace/mzm/test` | `codex/gv4/gpt-6.1-sol` |

实际实验产物位于两个目录下的 `team-task-demo`。模型使用本次环境已有会话的网关标识；其他环境应选择自己的可用模型。

## 使用

「执行节点与成员」默认先显示已配置的成员卡片，包括 Host、Runtime/模型、职责和默认目录；后面是项目与节点列表。点击各区「添加」或卡片「编辑」才打开表单，桌面为弹窗，手机为可滚动底部面板。保存成功自动关闭，取消不保存草稿。已有成员/项目 ID 不可编辑。
1. 打开「执行节点与成员」，配置项目及各 Host 目录；同一 Host 可保存多个成员，分别选择 Runtime、具体模型和职责。查询模型使用目标 Host 的目录；也可填写已验证的完整标识。保存成员必须指定具体模型，不自动采用 Runtime 默认模型。
2. 在看板点击「＋ 添加任务」展开表单，填写目标和验收条件并选择项目，点击「创建任务」才保存。取消或收起不创建任务。桌面显示五列，手机通过带数量的状态筛选切换。
3. 进入任务，输入具体指令，通过「@ 选择成员」搜索名称、Host 或 Runtime，选好后点击输入框右下角「发送」。不选成员只发表评论；最多选择 8 位成员，单纯输入文本中的 `@名字` 不会触发执行。
4. 「参与执行」显示每次派发的 Host、Agent ID 和状态。「查看会话记录」打开弹窗，每 4 秒读取最新事件，可加载更早记录、处理工具权限，并查看已保存的最终结果。完成后的会话仍可读取，原始历史需要执行 Host 在线；最终回复已保存在主 Host。
5. 结果自动作为成员评论写回同一任务。再次 `@` 同一成员会继续该任务的原 Agent 会话；首次指派自动创建。每条指派有独立执行轮次，并保留触发评论和上一轮关联。成员正在执行时，补充指派排队，当前轮结束后送入同一会话。
6. 所有成员当前回合结束后，任务进入「待审核」或「阻塞」；检查实际产物后人工标记完成。

需要纠正运行方向时，点击「暂停任务」。后台先持久化冻结派发，再中断本任务各节点的运行；排队项保持暂停。中断未确认（包括节点离线）时显示「暂停中」，后台重试；确认后才显示「已暂停」。此时可直接保存讨论，再 `@` 选择成员，点击「继续并发送」恢复选中的成员；未选择的成员保持暂停。旧排队指派不会在恢复时自动执行。

「停止执行」只中断该轮，不冻结其他排队项；修改看板状态也不会停止 Agent。不选成员只保存评论，不向 Agent 发送消息。暂停和停止保留会话与文件，不回滚修改，也不保证终止工具启动的脱离会话的后台进程。续跑复用原会话完整上下文，并附上截至触发评论的最近 15 条讨论；成员的 Host、Runtime/模型或实际目录发生变化时自动创建对应的新会话，避免混用环境。远端原会话缺失时显示错误，不静默丢弃上下文。

若续跑消息已发出但确认丢失，后台查询原会话最近 80 条事件中的消息标识进行对账；无法确认时显示「等待送达确认」，不会盲目重发。可查看原生会话核实，或停止该轮后用新评论明确再次指派。

已配置「双主机测试项目」：当前 Host 对应 `C:\test`，deeplearning 对应 `/data2/gv_data/workspace/mzm/test`。项目任务使用该 Host 的项目目录；未配置对应 Host 时拒绝派发。无项目的历史任务继续使用成员默认目录。派发时固定实际目录，之后编辑项目不会改变已有执行。项目路径关联不包含文件同步。

协作项目现在直接选择各 Host 的 Paseo 项目，选项显示名称和目录，不要求选择 Workspace。关联使用稳定项目 ID；保存及每次派发时查询目标 Host 的最新项目目录，项目删除或 Host 无法访问时拒绝新派发，已有执行保留原目录。旧路径配置继续可读，选择原生项目后替换；也可取消某个 Host 的关联。

项目编辑弹窗内，每个 Host 都提供「刷新项目」和「新建 Host 项目」。新建支持登记已有绝对目录，或浏览父目录后创建以项目名称命名的新目录，随后自动选中。创建操作立即保存到该 Host 的 Paseo，原生项目界面也能看到；取消协作项目编辑只取消关联草稿，不删除已经创建的 Host 项目。新建目录仅创建一层，父目录必须存在。

验收额外创建了两台 Host 的 `test/team-project-qa` 项目，并关联到「Host 项目创建验收」协作项目；没有修改原测试根目录关联，也没有为本轮验收派发 Agent。

任务详情通过「任务状态」下拉菜单变更状态；执行记录显示该次使用的具体 Runtime/模型，便于区分历史失败配置。网关实际可用性仍以执行结果为准，查询到模型不等于网关接受该模型。

如果手机也配对了执行节点，可以用「打开原生会话」深入查看。仅连接主 Host 时，插件自己的执行记录仍可使用。问题、计划等复杂交互目前需要原生会话处理；工具请求支持在任务页批准本次请求或拒绝。

评论支持附件：桌面/Web 点击「＋ 附件」选择 UTF-8 文本、Markdown、JSON/CSV/YAML/日志或 PNG/JPEG/WebP/GIF 图片，每条最多 4 个，单个最大 512 KB。附件先保存在主 Host；发送后点击附件可查看文本原文或图片。指派成员时，本次评论附件通过 Paseo 文件上传 API 传到各执行 Host，并随本轮指令传给 Agent；重试复用已保存的上传结果。附件不会自动同步到项目目录，后续评论也不会自动重新发送旧附件。

原生手机客户端可以查看附件并粘贴内容创建文本附件；当前 SDK 未提供设备文件/相册选择接口，因此手机本地文件与图片上传尚未接入。浏览器手机宽度测试不能替代 iOS/Android 真机验收。

## 节点接入

主 Host 的后台必须持有远端连接授权。插件支持粘贴 Paseo Relay 配对链接，校验 Host ID 并验证连接后保存。无需 SSH，也无需在远端安装本插件。

本次已从桌面客户端读取 deeplearning 的已有 Relay 配对完成接入。没有导入其他远端节点。凭据存储在主 Host 用户目录，界面 RPC 不返回连接配置。

## 安装和开发

```powershell
npm ci
npm run typecheck
npm run lint
npm test
paseo plugin install C:\00_work\greenvalley\code\llm\paseo-plugins\paseo-team-tasks
```

若 CLI 未加入 PATH，本地开发安装可运行：

```powershell
node_modules/.bin/tsx server/install.ts
```

此脚本要求目标 daemon 已启用插件；只安装或重载本插件，不重启 daemon。源代码修改后需重载才会生效。Paseo 插件是受信任、无沙箱的代码；服务端以 daemon 用户权限运行，界面运行在连接它的客户端中。

```powershell
npm run format
npm run typecheck
npm run lint
npm test
npm run probe
```

## 主 Agent 的 CLI 入口

主 Agent 可以调用以下命令；请求通过正在运行的插件 RPC 处理，不会启动第二个后台或数据库写入者。

```powershell
npm run team -- snapshot
npm run team -- create create-task.json
npm run team -- project project.json
npm run team -- comment comment.json
npm run team -- timeline <runId>
npm run team -- stop <runId>
npm run team -- pause <taskId>
npm run team -- status <taskId> in_review
```

创建任务文件：

```json
{
  "requestId": "unique-task-1",
  "title": "任务标题",
  "projectId": "two-host-test",
  "description": "目标与验收条件"
}
```

评论和派发文件：

```json
{
  "requestId": "unique-comment-1",
  "taskId": "task-unique-task-1",
  "body": "执行这次明确指派的工作",
  "memberIds": ["local-dev", "remote-dev"]
}
```

重试同一请求须保留 `requestId`；新指令使用新 ID。成员执行结果不会自动触发评论中的 `@`，从而避免成员互相唤醒循环。主 Agent 可读取结果，再主动提交下一条指派。

暂停后的继续指派在评论 JSON 中增加 `"resumeTask": true`；只有所选成员会继续，必须等所有节点确认暂停后才能提交。普通讨论不需要此字段。

## 数据与恢复

默认目录是 `$PASEO_HOME/team-tasks`；未设置 `PASEO_HOME` 时使用 `~/.paseo/team-tasks`。`state.json` 保存任务、成员、评论、执行映射和结果；`connections.json` 保存远端连接配置。可用 `PASEO_TEAM_HOME` 覆盖数据目录。

每个执行记录在派发前落盘，以固定的幂等键创建 Agent；模型、提示词和全局 Run 到远端 Agent 的映射会保留。插件重载后对账原执行，不另建 Run。同一 Host、同一工作目录串行运行，Windows 路径大小写和分隔符会归一化；不同 Host 可以并行。

只在一个主 Host 安装一份该插件。当前文件存储由单个插件进程拥有，不支持多个安装实例共享同一个数据目录。主 Host 离线时，远端已启动的 Agent 可以继续工作，后续派发和结果汇总等待主 Host 恢复。

执行过程按需从远端读取，完整历史仍由远端保存；当前页面只显示最近 80 条，暂不提供分页。最终结果保存在主 Host。调用失败时后台继续使用原映射对账；请查看节点和原生会话诊断，不要把断线当成任务尚未启动。

本版不包含自动 Leader 循环、DAG、通用 Git 合并或通用产物同步。双 Host 实验中的文件集成由 `server/smoke.ts` 明确执行，通过 Paseo 文件 API 拉取，避免把“消息汇总”误认为“文件已经同步”。

## 双 Host 实验

`server/smoke.ts` 是本次环境的实验脚本，包含明确的测试目录和成员配置。`start` 会创建任务并调用真实 Agent，可能产生模型费用；不要将它当作单元测试运行。

```powershell
npm run smoke -- start
npm run smoke -- status
npm run smoke -- integrate
```

首次调用 `start` 后，任务 ID 保存在 `evidence/smoke-task.json`；`integrate` 等待两位成员首轮完成，从 deeplearning 读取真实模块文件，再向本机成员派发集成验收。测试记录见 [QA.md](QA.md)。

新代码独立实现，未引入 Multica 源码、UI 或提示词。SDK 和传输依赖使用 Paseo 自身接口。
