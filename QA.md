# 验证记录

## 讨论时间线与响应式执行详情

- 类型检查、Biome lint/format 和 `server/store.test.ts` 的 5 项定向测试通过。新增断言覆盖触发评论后嵌入执行卡片、结果完成顺序、历史孤立执行记录及成员最新执行汇总。
- 在真实插件中通过 Playwright 验证 1440×1000 桌面、900×844 窄窗口和 390×844 手机宽度：桌面右侧详情、窄屏全屏详情、底部输入框正常；返回保留未发送草稿、评论展开状态及实际滚动位置。窄屏详情打开时，背景讨论从可访问性树隐藏。
- 本机及远端的已完成会话均读到指令、工具活动及结果；成员、项目目录、Host 三个管理入口各自展示列表，英文新成员弹窗正常。没有启动新 Agent、改变任务状态或发送验收草稿，语言已恢复跟随系统。
- 截图与操作脚本保存在忽略提交的 `evidence/discussion-final-*`。已热加载插件，无 daemon 重启。手机验证为浏览器响应式检查，尚未验证 iOS/Android 真机键盘。

日期：2026-10-23。插件运行于当前 Windows Host 的 Paseo 0.11.4，deeplearning 通过已有 Relay 配对接入。未修改 Paseo 核心代码，未重启主 daemon。

## 双 Host 开发实验

任务：`task-smoke-1792730009138`，标题「双 Host 协作：开发任务统计 CLI」。

| 执行         | 目录                                               | 交付                                    |
| ------------ | -------------------------------------------------- | --------------------------------------- |
| 本机首轮     | `C:\test\team-task-demo`                           | CLI、样例、8 项集成测试、README         |
| deeplearning | `/data2/gv_data/workspace/mzm/test/team-task-demo` | 统计模块、6 项单元测试                  |
| 本机集成     | `C:\test\team-task-demo`                           | 真实集成测试、CLI 执行、verification.md |

主控通过 Paseo 文件 API 读取远端 `stats.mjs`、`stats.test.mjs` 并集成本机。验收从 Agent 的原始工具事件核对执行输出，而不是只读取成员的总结文字：
- `node --test stats.test.mjs integration.test.mjs`：14 项通过，0 项失败。
- `node cli.mjs sample.json`：`{"total":3,"todo":1,"doing":1,"done":1,"completionRate":33}`。
- 两个集成文件与远端文件的 SHA-256 相同：
  - stats.mjs：`43b876d2305c2bc33287877d2672b34dea3332b3ee47f04d135328a484739468`
  - stats.test.mjs：`0cfc26d0c1485483d5277dfa399b459fdba7de13b50570c048110bbf3e361348`

初次派发采用 Provider 目录默认模型，被当前模型网关返回 `model_not_found`。错误已进入任务评论，历史执行记录保留。成员随后改为现有会话使用的 `codex/gv4/gpt-6.1-sol` 并重新派发成功。没有修改全局 Provider 配置。

测试 Agent 的目录写入及命令执行权限逐项检查后处理，没有开启自动批准或改变 daemon 的全局权限。权限请求也通过插件页面成功批准一次。原始事件和检查结果保存在本机忽略提交的 `evidence/` 目录；开发产物的验收报告在 `C:\test\team-task-demo\verification.md`。

## 插件验证

- TypeScript 类型检查、Biome lint/format 通过。
- 两个针对性测试文件，目前共 31 项通过；覆盖原会话续跑、运行中补充排队、任务级暂停、部分成员恢复、离线中断、创建和发送过程中暂停、丢失确认后的重启对账、模型/目录变化的会话隔离，以及完成前需确认中断。还覆盖完成后历史分页、附件校验和上传复用；语言测试检查英文回退、占位符一致性、用户内容保留，以及五个界面文件中文文案的翻译接入。
- 真实安装及热重载通过，重载后继续观察已有执行；手机无需一直连接。
- 使用安装版 Paseo Web 客户端，在独立浏览器中加载真实插件及其 RPC；检查桌面与 390×844 手机宽度的看板、任务详情、执行记录和权限卡片。
- 实际点击看板任务、成员执行过程和批准请求；截图经视觉检查后修复手机看板列高度重叠。手机宽度验证不替代 iOS/Android 真机测试。

## 已知范围

任务和评论由单个主 Host 插件持久化；执行过程每 4 秒读取远端最新 80 条，可按游标加载更早历史，不是完整日志镜像。原生 Host 历史中可能缺少已保存的最终回复，因此弹窗独立显示插件结果。自动 Leader 循环、DAG、自动代码合并及通用产物同步尚未实现。

会话与评论验收：Playwright 验证真实插件的完成会话弹窗、390×844 下的成员搜索与已选项、右下角发送、UTF-8 Markdown 和图片评论持久化及预览；关闭图片后再打开文本无渲染错误。仅在已有 UI 验收任务新增一条无成员指派的附件评论；未启动新 Agent。两个 Host 的原生文件 API 均接受实际 Markdown 与图片，执行记录仍为 5 条、活跃 0 条。文件传递给创建请求及重试幂等由定向测试覆盖，未另跑模型任务。截图在 `evidence/history-dialog-desktop.png`、`member-picker-discussion-mobile.png`、`composer-discussion-mobile.png`、`attachment-text-mobile.png` 和 `attachment-image-mobile.png`。原生手机文件选择尚不支持。

展示审计：原有 2 个协作项目、2 个任务及其状态保持原样。新增独立的「会话续跑与暂停验收」任务，用于本轮实测。历史开发任务尚未关联项目且仍为待办，虽然验收结果已完成；未自动改写此人工状态。其 5 条执行均能从正确 Host 取回历史，2 条模型失败作为历史保留。

会话续跑实测：本机与 deeplearning 的两个 Agent 均在 running 状态收到任务暂停，确认后显示 paused；保存修正讨论，再显式恢复两位成员，新增两轮执行分别沿用原 Agent ID。两轮最终均 completed，原生 Timeline 可见带本轮标识的补充用户消息；主控使用两台 Host 的文件 API 独立读回 `team-session-qa/notes.txt`，均为 20 字节 `final-session-reused`。按工具请求逐项批准限定测试目录的写入和验证，没有修改全局权限。证据在忽略提交的 `evidence/session-qa-result.json`。

Playwright 检查真实插件桌面及 390×844 手机宽度：暂停状态、成员原会话提示、触发评论、英文「Continue & send」均正常，无新建会话选项；仅选择成员和编辑草稿，没有发送 UI 测试草稿。截图为 `evidence/session-desktop.png` 和 `evidence/session-continue-en-mobile.png`。语言恢复跟随系统。本轮手机验证仍为浏览器宽度测试。

语言验收：在真实插件通过 UI 从跟随系统切换为 English，检查英文看板、成员列表、新成员弹窗、会话结果和手机宽度的成员选择；原有中文任务、职责、成员名和输出均保留。刷新后 English 仍生效；切换简体中文后界面即时更新，刷新后保留；验收结束恢复跟随系统。未派发新 Agent 或修改任务状态。证据：`evidence/board-en-desktop.png`、`team-settings-en-desktop.png`、`member-editor-en-desktop.png`、`member-picker-en-mobile.png`、`board-zh-mobile.png`。未做 iOS/Android 真机语言测试。

## 看板、项目及成员配置更新

- 定向测试共 12 项通过，新增覆盖项目目录覆盖与执行快照、缺失路径原子拒绝、同 Host 多 Runtime 成员、必须指定具体模型。
- 类型检查、Biome lint/format 通过。
- Playwright 在真实插件页面检查桌面 1440×1000 和手机宽度 390×844：默认隐藏创建表单，添加/取消正常；通过 UI 保存「双主机测试项目」，创建关联任务，并用状态菜单标记完成，手机状态筛选正确显示该任务。未启动额外开发 Agent。
- 插件 RPC 读回验证两个项目目录与新任务项目关联、完成状态均已持久化。实际查询两台 Host Runtime 及 Codex 模型目录正常；两台均提供 Codex/OpenCode。模型目录不等于网关执行验证。
- 新截图：`evidence/board-v2-desktop.png`、`board-v2-mobile.png`、`create-v2-mobile.png`、`task-v2-mobile.png`。本次仍为浏览器宽度测试，不替代手机真机验证。

## 成员列表与弹窗更新

- 默认页面以成员卡片为主，项目与节点分别显示列表，所有添加/编辑表单移入 SDK Modal。
- Playwright 验证 1440×1000 桌面和 390×844 手机宽度：初始无输入框；成员编辑 ID 锁定；修改名称后取消再打开恢复原值；成员及项目原值保存成功后关闭弹窗；添加成员、项目、节点取消不新增记录；长表单可滚动关闭。
- 无效成员保存时校验错误在弹窗内保留，经过后台轮询后仍可见。没有派发 Agent。
- 类型检查、lint 通过。截图在 `evidence/settings-list-desktop.png`、`settings-list-mobile.png`、`member-editor-desktop.png` 和 `member-editor-mobile.png`。

## 复用 Host 原生项目

- 项目编辑由手填多机目录改为各 Host 原生项目选择，支持刷新、浏览绝对目录、登记已有目录和创建目录并登记。项目 ID 持久化；派发查询实时目录，已删除项目拒绝派发；旧路径可保留到主动替换。
- 15 项定向测试通过，新增项目路径实时解析/删除拒绝/重复指派幂等、Windows/Linux 相对浏览路径解析、创建重试复用原项目及 Linux 大小写区分。类型检查和 lint 通过。
- Playwright 在真实客户端读取两台 Host 项目列表，选择各自 `test` 并保存原协作项目。分别在 `C:\test` 和 `/data2/gv_data/workspace/mzm/test` 下创建 `team-project-qa`，均成功登记为原生项目并自动选中；取消关联编辑后，新原生项目仍存在，重新从列表选择并保存到单独的「Host 项目创建验收」协作项目。
- 通过真实插件 RPC 读回两组共四个关联，核对原生项目 ID、实际目录以及目录存在性。原项目仍对应原测试根目录。没有启动 Agent 或重启 daemon。
- 桌面及手机宽度截图已视觉检查：`evidence/host-project-selected-desktop.png`、`host-project-browser-desktop.png`、`host-project-mobile.png`。手机底部面板可滚动，未做原生手机真机验证。
