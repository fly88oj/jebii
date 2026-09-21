# 「JEV + SoulLink」Live2D 角色聊天工具 — 技术调研报告

> 调研日期：2026-09-20
> 目标产品形态：Live2D 虚拟角色 + AI 聊天，前端 Electron 打包，可复制到任意电脑一键运行，支持 Windows 与 Linux。
> 说明：本报告所有关键论断均附来源 URL（官方文档 / GitHub 仓库优先）。术语考证部分的置信度为主观评估，最终语义需向用户确认（见第 4 节）。

---

## 目录

1. [JEV / SoulLink 术语考证（最重要）](#1-jev--soullink-术语考证)
2. [技术选型建议](#2-技术选型建议)
   - 2.1 Live2D 渲染库
   - 2.2 聊天 / LLM 后端架构（含情绪→动作映射、记忆、TTS 概览）
   - 2.3 Electron 打包与一键运行
3. [同类开源项目参考](#3-同类开源项目参考)
4. [风险与未知项 / 需向用户澄清的问题清单](#4-风险与未知项--需向用户澄清的问题清单)

---

## 1. JEV / SoulLink 术语考证

### 1.1 结论速览

| 术语 | 最可能的所指 | 置信度 | 一句话说明 |
|---|---|---|---|
| **Jev** | **TypeSafe AI 公司的 "Jev" 模型**（首个 "System One" 决策模型） | 中高（约 70%） | 不生成文本、只返回类型化判断（是/否、多选、打分 + 校准概率）的新模型，2026-09-16 公开发布，适合做「情绪分类→Live2D 表情」这类快速决策层 |
| **SoulLink** | **GitHub 项目 `nanlingyin/SoulLink_Live2D` 及同作者的 `soullink-emotion-sdk`** | 高（约 85%） | 一个「LLM 驱动的 Live2D 表情控制系统」开源项目 + 配套的 npm 表演引擎 SDK（`@soullink-emotion/*`），与用户描述的场景完全吻合 |

组合解读（最可能的架构意图）：**「JEV + SoulLink」= 用 Jev 做高速情绪/决策判断（选哪个表情、做什么动作），用 SoulLink 式的表演引擎把情绪转换为 Live2D 参数，再由一个常规 LLM 负责聊天文本生成。**

两个术语都存在同名干扰项，下面逐一列出证据。

### 1.2 Jev：TypeSafe AI 的 System One 模型（证据链）

**它是什么：**

- TypeSafe AI 是一家新 AI 公司（团队来自 OpenAI、Google Brain、Meta/FAIR 等），2026-09 发布了其首个公开模型 **Jev**，定位为「System One 模型」——取名自卡尼曼《思考，快与慢》中的「系统 1（快思考）」，模型名 Jev 则致敬经济学家 William Stanley Jevons。
  来源：<https://typesafe.ai/blog/introducing-system-one-models-and-jev>
- 官方文档：「Jev is TypeSafe's flagship model and the first System One model. Send state and typed questions; get structured answers your code can use directly.」——即输入「一段状态文本 + 一组类型化问题」，直接返回程序可分支使用的结构化答案，无需解析自然语言。
  来源：<https://docs.typesafe.ai/introduction.md>

**三种问题原语（与 Live2D 表情选择的契合点）：**

| 原语 | 作用 | 返回 |
|---|---|---|
| `Noul` | 判断某命题是否为真 | 0–1 概率 |
| `Choice` | 从选项列表中选择一项 | 选项 + 概率分布 + 置信度 |
| `Score` | 按评分量表打分 | 分数 + 概率分布 + 置信度 |

来源：<https://docs.typesafe.ai/introduction.md>

**性能与价格（官方宣称）：** 端到端响应 70ms–500ms，比在 LLM 上做同类结构化判断快 40x–200x；输入 $0.042/MTok，输出免费；并行评估所有问题，多问题几乎不增加延迟。
来源：<https://typesafe.ai/blog/introducing-system-one-models-and-jev>

**生态（证明这是一个真实且正在扩张的组件，而非孤例）：**

- 可通过 **Vercel AI Gateway** 以 `typesafe-ai/jev` 调用（端点 `POST /typesafe/v1/systemone`）：<https://vercel.com/docs/ai-gateway/sdks-and-apis/typesafe>
- `jev-cli` 明确记载 Jev 也可经 **OpenRouter** 与 Vercel AI Gateway 访问：<https://pypi.org/project/jev-cli/0.6.2/>
- **pydantic-ai** 已内置 `TypeSafeModel`（`typesafe:jev-latest`），可像普通模型一样填结构化输出：<https://pydantic.dev/docs/ai/models/typesafe/>
- 社区 MCP 服务器与工具链：`jev-mcp`（Glama 收录）<https://glama.ai/mcp/servers/Brainwires/jev-mcp>、`jev` PyPI 装饰器 <https://pypi.org/project/jev/>、示例集 `dabit3/jev-experiments`（DeepWiki 词条）<https://deepwiki.com/dabit3/jev-experiments>

**为什么它可能出现在「Live2D 角色聊天」语境里：**
Jev 的 `Choice` 原语天然适合「当前这句话应该触发哪个表情/动作」这类判断；SoulLink 系项目恰好需要这样一个「情绪规划器」（见 1.3）。用 Jev 替代通用 LLM 做表情判断，延迟从秒级降到亚秒级，且不会产生格式解析错误。这是一个技术上非常合理的组合。

**不确定性说明：** Jev 于 2026-09-16 才公开发布、目前为 early access（需 waitlist），属于「最新热词」；用户写作全大写 "JEV" 也可能是缩写、内部代号或另一小项目。搜索过的关键词包括："JEV Live2D"、"JEV GitHub repository AI agent protocol LLM"、"JEV Live2D 虚拟角色 AI 聊天 项目"、""Jev" "SoulLink" Live2D" 等，除 TypeSafe Jev 外未发现与 Live2D/AI 伴侣相关的其他 "JEV" 项目。**建议向用户确认**（见第 4 节）。

### 1.3 SoulLink：三个候选与证据

#### 候选 A（最可能）：`nanlingyin/SoulLink_Live2D` + `soullink-emotion-sdk`

**仓库 1：SoulLink_Live2D —「LLM 驱动的 Live2D 表情控制系统」**

- 自述：「SoulLink_Live2D 是一个创新的项目，它不通过程序直接使用注册的 motions，而是通过大语言模型（LLM）理解对话内容和情感，实时控制 Live2D 虚拟形象的表情/动作变化，让数字人更加生动自然。」
  来源：<https://github.com/nanlingyin/SoulLink_Live2D>
- 核心能力（README 摘录）：
  - AI 驱动表情：LLM 理解文本情感，自动生成 Live2D 表情参数（而非仅调用预注册 motion）
  - TTS 连续动作：语音播放期间按帧生成连贯动作序列（每 2s 一帧，两阶段：先由 LLM 生成每帧动作描述，再转换为参数值），支持口型同步
  - 多模型热加载（watchdog 监控 `l2d/` 目录）、遮罩系统、环境光照、表情参数平滑过渡（easeInOutCubic）
  - 架构：Python aiohttp 后端（WebSocket 双向通信）+ Vue 3 前端 + `pixi-live2d-display v0.4.0` + PixiJS v6.5.10
  - LLM 配置分 `llm.api.expression`（表情生成）与 `llm.api.chat`（对话生成）两路，支持在线 API 或本地 Qwen2.5 + LoRA
  来源：<https://github.com/nanlingyin/SoulLink_Live2D>
- 模型目录结构要求（`model3.json` / `moc3` / `cdi3.json` / `physics3.json` / `pose3.json` / `model_prompt.txt` 等）与官方 Cubism 4 资产布局一致。来源同上。

**仓库 2：soullink-emotion-sdk — 实时角色表演 SDK（npm 包族 `@soullink-emotion/*`）**

- 自述：「A framework-agnostic real-time Live2D expression and motion SDK for desktop companions and AI characters, powered by continuous VAD emotion, FACS/AU synthesis, layered animation, and automatic model adaptation.」
  来源：<https://github.com/nanlingyin/soullink-emotion-sdk>
- 包结构（README 表格）：
  | 包 | 用途 |
  |---|---|
  | `@soullink-emotion/engine` | 框架无关的情绪/表演引擎（VAD、FACS、Idle 动作、口型混合为每帧 Live2D 参数） |
  | `@soullink-emotion/runtime-core` | 无头会话、TTS、音频、planner 编排 |
  | `@soullink-emotion/planner-openai` | **OpenAI 兼容**的反应/说话动作规划器 |
  | `@soullink-emotion/classifier-embedding` | 基于 embedding 的情绪分类 |
  | `@soullink-emotion/live2d-pixi` | PIXI v7 渲染适配 + Cubism 元数据工具 |
  | `@soullink-emotion/profile-generator` | Node 端从 `.model3.json`/`.cdi3.json`/`.exp3.json` 自动生成并校验 `soullink.profile.json`（LLM 输出会先对照真实 CDI 参数 ID 校验后才落盘） |
  来源：<https://github.com/nanlingyin/soullink-emotion-sdk> 及 npm：<https://www.npmjs.com/package/@soullink-emotion/engine>、<https://www.npmjs.com/package/@soullink-emotion/planner-openai>、<https://www.npmjs.com/package/@soullink-emotion/profile-generator>
- 关键设计：情绪用 **VAD（Valence-Arousal-Dominance）连续向量** 表示，经 FACS（面部动作单元）合成为 Live2D 参数；说话动作规划支持 `fixed-parallel`（与 TTS 并行）与 `duration`（按语音时长定帧数）两种模式；凭据/LLM 输出不可用时优雅降级为纯 VAD/FACS 表演。
  来源：<https://www.npmjs.com/package/@soullink-emotion/planner-openai>
- SDK 自带浏览器 Lab（`http://127.0.0.1:4173`）用于测试 profile；明确提示「Live2D 模型与 Cubism Core 不在 SDK 许可范围内，再分发前需单独确认条款」。
  来源：<https://github.com/nanlingyin/soullink-emotion-sdk>

**判断依据：** 该项目名（SoulLink）、领域（Live2D 表情/动作控制）、形态（角色聊天 + TTS + 口型）与用户描述三者完全重合，且作者同时维护 Python 全栈版（SoulLink_Live2D）与 TypeScript SDK 版（soullink-emotion-sdk），后者恰好是「嵌入自己的 Electron 应用」所需的形态。**这是置信度最高的解释。**

#### 候选 B（同名干扰项）：商业 AI 伴侣 App「SoulLink」（soullink.ai）

- 一家 2025 年创立于洛杉矶的公司（Daedalia/Waldenden，曾入 a16z speedrun）推出的免费 AI 伴侣 App（iOS/Android），角色名为 4D，住在名为 Neo City 的近未来 3D 世界；卖点是**电影级 3D 渲染、专有分层记忆系统（永久免费）、角色主动发起联系**。
  来源：<https://soullink.ai/>、<https://blog.getsoullink.com/what-is-soullink-everything-you-need-to-know-about-the-ai-companion-built-around-one-friend/>、App Store <https://apps.apple.com/us/app/soullink-3d-ai-life-sim/id6752530994>、Google Play <https://play.google.com/store/apps/details?id=com.daedalia.soullink>
- 注意两点：① 它是 **3D 而非 Live2D**；② 它主打的「分层记忆系统」恰好回应了调研问题中「SoulLink 是否是某种记忆/人格系统」的猜想——在这个商业产品的语境里，是的。但其闭源移动 App 形态与「Electron 打包的 Live2D 工具」不匹配，故判定为干扰项而非目标。

#### 候选 C：纯 SDK 名（Soullink Emotion）

若用户只想要表演引擎而不想要 Python 全栈，"SoulLink" 也可能单指上面的 `soullink-emotion-sdk`（其 npm 描述自称「SoullinkLive 的纯 TypeScript 表演引擎」）。与候选 A 不冲突，属同一作者生态。

### 1.4 「JEV + SoulLink」组合的合理架构（供与用户确认）

```
用户输入（文字/语音）
   │
   ├─► 聊天 LLM（任意 OpenAI 兼容 API）──► 流式文本（SSE）
   │                                        │
   ├─► Jev（TypeSafe System One）            │
   │     Choice: 当前情绪 = happy/sad/…      │
   │     Noul:   是否需要播放安抚动作？        │
   │     （70–500ms，带置信度）               │
   │        │                                │
   │        ▼                                ▼
   └─► SoulLink 式表演引擎（VAD/FACS → 每帧 Live2D 参数）
          │
          ▼
      Live2D 渲染（PixiJS + Cubism Core）+ 口型同步（TTS 音频振幅）
```

备选降级方案：不接入 Jev 时，SoulLink 的 `planner-openai` 本身就支持用任意 OpenAI 兼容 LLM 做情绪/动作规划，或在本地用 embedding 分类器（`classifier-embedding`）甚至纯 VAD/FACS 无模型表演。
来源：<https://www.npmjs.com/package/@soullink-emotion/planner-openai>、<https://github.com/nanlingyin/soullink-emotion-sdk>

---

## 2. 技术选型建议

### 2.1 Live2D 渲染（浏览器 / Electron 内）

#### 2.1.1 候选库全景

| 库 / 分支 | Cubism 支持 | PixiJS | 维护状态 | 许可证 | 备注 |
|---|---|---|---|---|---|
| 官方 Cubism SDK for Web（`Live2D/CubismWebFramework` + Cubism Core） | 5（兼容 3/4/5） | 无绑定 | 官方持续更新 | Live2D 专有（见 2.1.3） | 功能最全（motions/expressions/physics/pose），API 较重 |
| `guansss/pixi-live2d-display`（原版 master） | 2.1 / 4 | v6 | **基本停止维护**（issue #181：「This repository seems to have not been maintained for a while」） | MIT | 最经典封装，Shizuku/Haru 示例随仓库再分发 |
| `guansss/pixi-live2d-display` 的 lipsync 线（PR #117 → RaSan147 维护） | 2.1 / 4 | v7 | 活跃 | MIT | npm 包 `pixi-live2d-display-lipsyncpatch`（如 v0.5.0-ls-8）；音频驱动口型、多动作并行；`Sekai-World` 组织亦维护同名线 |
| `Untitled-Story/untitled-pixi-live2d-engine` | 2/3/4/**5** | **v8** | 活跃（2026 年仍发版） | MIT | 基于 mulmotion 分支重写；Lucie-AI 实际采用 |
| `naari3/pixi-live2d-display`、`omniwaifu/pixi-live2d5` | 5 | v8 | 小规模 | MIT | Cubism5-only 的轻量 fork |
| `hacxy/l2d` + `l2d-widget`（原 `oh-my-live2d`） | 2 / 5（内置运行时） | 自带 | 活跃（l2d-widget 周下载 1.4 万+） | MIT | 网页看板娘挂件形态；**注意**其运行时内嵌 Cubism SDK，商业使用须自查 Live2D 许可 |
| Python 路线 `Arkueid/live2d-py` | — | — | 活跃 | — | 桌面端 OpenGL 直渲染，适合 Python 桌宠（本项目不用，仅参考） |

来源：
- <https://github.com/guansss/pixi-live2d-display>（原版 README：PixiJS 6.x、Cubism 2.1/4、MIT、示例模型 Free Material License）
- <https://github.com/guansss/pixi-live2d-display/issues/181>（停止维护 + Pixi v8/Cubism 5 分支讨论）
- <https://github.com/guansss/pixi-live2d-display/pull/117>（RaSan147 的 lipsync PR「Live2D with Lipsync (Seperated)」）
- <https://github.com/RaSan147/pixi-live2d-display/>（lipsyncpatch 版本 v0.5.0-ls-8、Live Lipsync 特性）
- <https://github.com/Sekai-World/pixi-live2d-display>（Sekai 维护线，含 RaSan147 贡献）
- <https://github.com/Untitled-Story/untitled-pixi-live2d-engine>（PixiJS v8 + Cubism 2–5）
- <https://github.com/naari3/pixi-live2d-display>、<https://github.com/omniwaifu/pixi-live2d5>
- <https://oml2d.hacxy.cn/>（oh-my-live2d 文档：「默认集成 Cubism2.1 和 Cubism5」）
- <https://github.com/hacxy/l2d-widget>（改名说明：「原 `oh-my-live2d` 已更名为 l2d-widget」）、<https://github.com/hacxy/l2d>（运行时内嵌 Cubism SDK 的许可提示）
- <https://github.com/Arkueid/live2d-py>

关于「主分支与 l2d 分支差异」（调研问题原文）：guansss 原仓库的 lipsync 开发线即 PR #117 所在分支，由 RaSan147 延续并发布为 `pixi-live2d-display-lipsyncpatch`；`Sekai-World/pixi-live2d-display`（Project SEKAI 社区）在该线上继续维护。差异要点：l2d 线新增**音频驱动口型（attachAnalyzer / model.speak）**、**多动作并行播放**，并将 PixiJS 升到 v7。Open-LLM-VTuber 曾长期使用 `pixi-live2d-display-lipsync`（即该线），后迁移至官方 Web SDK（见第 3 节）。

#### 2.1.2 推荐方案

**推荐：PixiJS v7/v8 + `pixi-live2d-display` 生态的活跃分支（首选 `untitled-pixi-live2d-engine`，或 `pixi-live2d-display-lipsyncpatch`），配 Cubism 5 Core。**

理由：
1. Electron 渲染进程就是 Chromium，Web 方案零成本复用；MIT 许可对分发友好（Cubism Core 本身另算，见 2.1.3）。
2. 若采用 SoulLink SDK 路线：`@soullink-emotion/live2d-pixi` 明确基于 **PIXI v7 + pixi-live2d-display** 适配（`createScriptTagCubismLoader("/live2dcubismcore.min.js")`），与 lipsyncpatch 线同源，组合无摩擦。来源：<https://www.pkgstats.com/pkg:@soullink-emotion/live2d-pixi>
3. 需要旧 Cubism 2 模型（大量社区免费模型是 2.x）→ 选支持 2.1 的线（lipsyncpatch / untitled-engine）；只面向新模型 → 官方 Web SDK 亦可（Open-LLM-VTuber 已验证 Cubism 5 可用，但官方 SDK 的 motionsync 尚未支持）。来源：<https://github.com/Open-LLM-VTuber/Open-LLM-VTuber/releases>
4. `oh-my-live2d/l2d-widget` 面向网页看板娘挂件，交互模型固定（角标、提示气泡），适合快速出 demo，不适合作为聊天工具的底座。

#### 2.1.3 Live2D 许可证（重点风险区）

**Cubism SDK（含 Core）分层许可：**

1. 下载/开发阶段：免费，但须同意 **Live2D Proprietary Software License Agreement** 与 **Live2D Open Software License Agreement**。
   来源：<https://www.live2d.com/en/sdk/about/>、<https://www.live2d.com/en/sdk/license/>
2. **发布**使用 SDK 的内容时，原则上需签订 **SDK Release License（Publication License Agreement））并付费——但以下主体豁免：「Individuals and Small-Scale Enterprises are exempted from the license and payment (except Expandable Application)」；官方帮助中心进一步明确豁免条件为「General Users 与 Small-Scale Enterprises，年销售额低于 1,000 万日元」。
   来源：<https://www.live2d.com/en/sdk/license/>、<https://help.live2d.com/en/sdk/sdk_001/>
3. **⚠️ 关键例外——Expandable Application（可扩展应用）**：官方定义 avatar 系统（avatar systems）这类允许用户导入/扩充 Live2D 模型的应用属于 Expandable Application，**无论发布者规模（包括个人）都需要事先审查并签订特别 Publication License**，且原则上要求有有效营收模式（完全免费原则上不获批准，个别条件下可特批）、显示 Live2D 标志并登录 Showcase 页。
   来源：<https://www.live2d.com/en/sdk/license/expandable/>
   → **本项目若允许用户导入自己的 Live2D 模型，很可能落入此条款**；若仅内置固定模型（不可扩展），个人/小企业则可豁免。这是需要用户决策的产品形态问题（见第 4 节）。
4. 企业规模门槛：年销售额 ≥ 1,000 万日元 = 中企业（付费），≥ 1 亿日元 = 大企业；个人/小企业（< 1,000 万日元）免费。PC 买断制内容中企业一次性 ¥600,000 起。
   来源：<https://www.live2d.com/en/sdk/license/purchase_plan01/>、<https://www.live2d.jp/eng/publication-license/form/>
5. 类似先例：`chyinan/Kokoro-Engine`（Tauri 虚拟角色引擎）在 README 中专门附了两个 EULA 链接并声明 Cubism SDK 部分归 Live2D 所有；`Tacky7788/Project-elino`（Electron Live2D/VRM 伴侣）采用「安装向导引导用户自行同意 Live2D SDK 许可」的做法。
   来源：<https://github.com/chyinan/Kokoro-Engine>、<https://github.com/Tacky7788/Project-elino>

**官方示例模型（Hiyori 等）能否随应用再分发：**

- 示例模型受 **Free Material License Agreement** 约束。该协议区分：Freeware / Sample Code / Live2D 原创角色（Live2D Original Character）/ 联动角色 / 外部授权角色。**Live2D 原创角色**（含 Hiyori Momose、Haru、Shizuku、Mao、Mark、Rice、Natori 等）在遵守各角色附加条款的前提下，允许「使用、修改并 **Distribute**（作为作品的一部分分发）」；但 4.1.1 条原则上禁止把素材本身 **Redistribute**（原样再分发素材包），且素材内含的**音频数据**未经明示许可不得再分发。
  来源：<https://www.live2d.com/eula/live2d-free-material-license-agreement_en.html>
- Hiyori 下载页明确：「发布使用 Live2D 提供的示例素材的作品时，General User 或 Small-Scale Enterprise（年销售额低于 1,000 万日元）可自由用于营利与非营利创作活动（Unity-chan、初音未来除外）」。
  来源：<https://www.live2d.com/en/learn/sample/momose-hiyori-video/>、FAQ <https://help.live2d.com/en/other/other_16/>
- 各角色附加条款（示例数据使用条款）：**Hiyori / Miara「不允许对角色设计做任何改动」**；Shizuku 不得改名改设定等。
  来源：<https://www.live2d.com/en/learn/sample/model-terms/>
- 官方 Cubism 示例仓库自身也列出 Haru/Hiyori/Mark/Natori/Rice 在 Free Material License 下随仓库分发（佐证「随应用打包官方示例模型」在满足条款时是官方认可的用法）。
  来源：<https://github.com/Live2D/CubismNativeSamples/blob/4-r.1/LICENSE.md>

**实操结论：** 个人开发、内置 Hiyori（不改设计、不带官方音频）随 Electron 应用分发，处于官方示例与豁免条款覆盖的常见做法范围内；一旦开放「导入任意模型」，进入 Expandable Application 审查区，需评估。

#### 2.1.4 模型格式与驱动要点

- `model3.json`（Cubism 3/4/5 描述文件）引用 `moc3`（模型数据）、`textures/`（贴图）、`motions/*.motion3.json`（动作）、`*.exp3.json`（表情）、`physics3.json`（物理摆动）、`pose3.json`（姿势）、`cdi3.json`（参数显示名，供 LLM/工具识别参数含义）。SoulLink_Live2D 的目录结构示例即按此组织。
  来源：<https://github.com/nanlingyin/SoulLink_Live2D>
- `pixi-live2d-display` 的抽象层：`Live2DModel` → `InternalModel`（core model / ModelSettings / MotionManager / ExpressionManager / FocusController），motion 有 `IDLE/NORMAL/FORCE` 三档优先级，表达式与动作互相独立。
  来源：<https://github.com/guansss/pixi-live2d-display/wiki/Complete-Guide>
- 口型同步两条路线：
  1. **音量驱动（主流、简单）**：Web Audio `AnalyserNode` 取 RMS 振幅 → 每帧写入 `ParamMouthOpenY`。Lucie-AI（edge-tts 波形 → `ParamMouthOpenY`）与 Live2D-LLM-Chat（读 TTS 音频文件实时振幅）均为实例；SoulLink SDK 提供 RMS/peak + attack/release 平滑的可选口型层。
     来源：<https://github.com/vincenzo-afk/Lucie-AI>、<https://github.com/suzuran0y/Live2D-LLM-Chat/blob/main/README_CN.md>、<https://www.npmjs.com/package/@soullink-emotion/engine>
  2. **viseme / 音素映射（精细）**：按音素映射多档口型（如官方 `kei_vowels_pro` 元音示例模型、Live2D 官方的 Cubism SDK MotionSync 插件方向；Open-LLM-VTuber 迁移到官方 Web SDK 时注明「尚不支持 motionsync」）。实现成本高，第一版建议不做。
     来源：<https://github.com/kellyzxiaowei/GeminiLive2d>（kei_vowels_pro 模型）、<https://www.live2d.jp/eng/publication-license/form/>（SDK 选项含 MotionSync Plugin）、<https://github.com/Open-LLM-VTuber/Open-LLM-VTuber/releases>

### 2.2 聊天 / LLM 后端

#### 2.2.1 接入层：OpenAI 兼容 API + 流式输出

- 事实上的行业标准是让用户自填 `base_url + api_key + model`，接入任意 OpenAI 兼容服务。同类项目佐证：
  - Open-LLM-VTuber：LLM 支持「OpenAI (and any OpenAI-compatible API)」、Ollama、Gemini、Claude、DeepSeek、LM Studio、vLLM 等。
    来源：<https://github.com/Open-LLM-VTuber/Open-LLM-VTuber>
  - Amica：Chatbot backend 为 `openai` 等（`NEXT_PUBLIC_CHATBOT_BACKEND`）。来源：<https://github.com/semperai/amica/blob/master/docs/getting-started/installation.md>
  - SoulLink_Live2D：`config.yaml` 中 `llm.api`（base_url/key/model）+ `expression`/`chat` 两路可分别覆盖。来源：<https://github.com/nanlingyin/SoulLink_Live2D>
- 流式输出用 SSE（OpenAI 兼容 `chat/completions` 的 `stream: true`）。前端逐 token 渲染、按句切分送 TTS 的做法在多个项目中验证（MeuxCompanion：文本逐字流式 + TTS 按句并行；Gionano/live2d-ai-companion：按句切 MP3 流式播放压首响延迟）。
  来源：<https://github.com/meet447/MeuxCompanion>（原 README 可见）、<https://github.com/Gionano/live2d-ai-companion>
- **Electron 下的安全要点**：api_key 不应暴露在渲染进程；SoulLink 的 planner 文档明确建议「Browser clients should use a trusted backend instead of holding an LLM key，HTTP 客户端会在发送前剥离 `openAI` 字段」。对本项目：在 Electron **主进程**做 API 代理（或 IPC 桥），key 存 `safeStorage`/系统钥匙串。
  来源：<https://www.npmjs.com/package/@soullink-emotion/planner-openai>

#### 2.2.2 情绪 → 动作映射（本项目核心体验，四种主流做法）

1. **文本内嵌标签法**（最常见、最简单）：约定 LLM 在回复中输出 `[happy]` 等标签，前端解析后查 `emotionMap`（情绪关键词→表情索引）驱动模型。
   - Open-LLM-VTuber 官方机制：「Agent System 生成带 `[emotion]` 标签的回复 → WebSocket 分离传输表情触发与文本 → emotionMap 映射到模型表情」。
     来源：<https://deepwiki.com/Open-LLM-VTuber/open-llm-vtuber.github.io/6.2-live2d-model-integration>
   - Lucie-AI：每条回复带情绪标签（happy/sad/surprised/blush/laugh/worried/neutral）+ 可选手势标签，前端转成 Live2D 参数目标与 motion 播放。
     来源：<https://github.com/vincenzo-afk/Lucie-AI>
2. **结构化 JSON 输出法**（更可控）：要求模型返回固定 JSON（文本 + 表情混合 + 参数覆盖），前端经白名单/范围裁剪后写入 `coreModel.setParameterValueById`，并做 overlay easing 平滑。
   - 实例：`entropy622/LLM_Live2D`（`expressionMix` + `parameterOverrides` + 运行时从模型资源自动发现 `.exp3.json` 与参数白名单）。
     来源：<https://github.com/entropy622/LLM_Live2D>
3. **独立分类器法**（聊天与情绪解耦）：聊天 LLM 只管文本；另一路（小模型/规则/embedding）对文本做情绪分类。
   - SoulLink SDK 的 `classifier-embedding` 即此路线；**Jev（TypeSafe）正是这一路线的理想引擎**——`Choice` 选情绪、`Noul` 判是否触发特殊动作，70–500ms 带置信度返回，还能按置信度决定「维持表情 or 切换」。
     来源：<https://github.com/nanlingyin/soullink-emotion-sdk>、<https://docs.typesafe.ai/introduction.md>
4. **参数级直控法**（上限最高、工程量最大）：不调用预注册 motions，由 LLM/引擎直接生成每帧参数（SoulLink_Live2D 的主卖点；其 TTS 连续动作为两阶段 LLM 规划）。
   来源：<https://github.com/nanlingyin/SoulLink_Live2D>

**推荐**：第一版用「标签法 + emotionMap」（半天可跑通），随后把情绪判断迁移到 Jev 或 SoulLink planner（结构化、带置信度、低延迟），文本与表演彻底解耦。

#### 2.2.3 记忆 / 人格

- 通行做法：人格 = system prompt（可配置的角色卡）；记忆 = 本地持久化对话历史 + 滑动窗口上下文。
- 实例：Cyrene-Agent「24 轮滑动窗口上下文 + 每会话独立 JSON 持久化」；Lucie-AI「磁盘 JSON 会话记忆」；Kokoro Engine「三层记忆（核心事实永不遗忘 + 临时衰减）+ SQLite + 语义/BM25 混合检索」；Open-LLM-VTuber「基于 Letta 的长期记忆」。
  来源：<https://github.com/VenQy/Cyrene-Agent>、<https://github.com/vincenzo-afk/Lucie-AI>、<https://github.com/chyinan/Kokoro-Engine>、<https://open-llm-vtuber.github.io/docs/intro/>
- 建议：Electron 下用 `app.getPath('userData')` 存 JSON/SQLite（与便携版 exe 的 `PORTABLE_EXECUTABLE_DIR` 策略配合，见 2.3.2）。

#### 2.2.4 TTS 概览（不深挖）

| 方案 | 特点 | 使用例 |
|---|---|---|
| **edge-tts** | 免费、微软神经声、Python/Node 库现成，桌面工具首选起步 | Lucie-AI、GeminiLive2d、Open-LLM-VTuber（Edge TTS） |
| **GPT-SoVITS** | 本地部署、少样本音色克隆，中文社区主流，但需 GPU/整合包 | chinokikiss/Live2D-Virtual-Girlfriend、Open-LLM-VTuber、Kokoro Engine |
| **kokoro** | 轻量本地 TTS，中文可用，资源占用低 | chinokikiss（整合包并列提供 Kokoro 仓库链接） |
| 商用 API（Azure/OpenAI/Fish Audio/MiniMax） | 质量高、按量付费 | Cyrene-Agent（MiniMax/GPT-SoVITS/自定义云端）、Gionano（Fish Audio 流式） |

来源：<https://github.com/vincenzo-afk/Lucie-AI>、<https://github.com/kellyzxiaowei/GeminiLive2d>、<https://github.com/chinokikiss/Live2D-Virtual-Girlfriend>、<https://github.com/Open-LLM-VTuber/Open-LLM-VTuber>、<https://github.com/VenQy/Cyrene-Agent>、<https://github.com/Gionano/live2d-ai-companion>

### 2.3 Electron 打包与一键运行

#### 2.3.1 目标格式

- **Windows：`portable` 目标**——electron-builder 官方定义：「Produces a single `.exe` that requires no installation — it extracts and runs directly」；无注册表、无开始菜单项、不需管理员；代价是**无自动更新**（electron-updater 不支持，需手动）。目标选择指南将其定位为「USB 盘、免安装场景」。
  来源：<https://www.electron.build/docs/configuration/>（Configuration 页 portable 条目）、<https://www.electron.build/docs/targets/>
- **Linux：`AppImage`**——官方定位「portable application format…runs on most Linux distributions without installation」；`chmod +x` 后即可运行；是 electron-builder 在 Linux 的**默认目标之一**（默认 AppImage + Snap）。
  来源：<https://www.electron.build/docs/configuration/>、<https://www.electron.build/docs/linux>
- 示例配置（综合官方文档）：
  ```yaml
  # electron-builder.yml
  win:
    target: [portable]          # 免安装单 exe
  linux:
    target: [AppImage]          # 免安装单文件
    category: Utility
  asar: true
  asarUnpack:                   # 需要以真实文件存在的资源
    - "resources/live2d/**"     # Cubism Core 脚本、模型、贴图
  extraResources:
    - from: resources/models
      to: models
  ```

#### 2.3.2 resources / asarUnpack 放 Live2D 资源

- asar 是 Electron 的归档格式，默认开启；`asarUnpack` 是「相对 app 目录的 glob 模式，指定打包时解包出 asar 的文件」；含可执行文件/原生模块会由 `smartUnpack` 自动检测解包（官方建议通常无需手动设置，异常时再报 issue）。
  来源：<https://www.electron.build/electron-builder.interface.platformspecificbuildoptions>（asarUnpack 定义）、<https://github.com/electron-userland/electron-builder/blob/master/packages/app-builder-lib/src/options/PlatformSpecificBuildOptions.ts>（AsarOptions.smartUnpack 默认 true）
- Live2D 资源为什么建议解包/放 `extraResources`：`live2dcubismcore.min.js` 需要以 `<script>` 方式注入且部分实现对 URL 有要求（SoulLink 的 `createScriptTagCubismLoader("/live2dcubismcore.min.js")` 即按静态路径加载）；模型贴图等大文件放 asar 外也便于用户替换模型。
  来源：<https://www.pkgstats.com/pkg:@soullink-emotion/live2d-pixi>、<https://github.com/guansss/pixi-live2d-display>（Core 以 script 标签引入）
- 便携版 exe 专属环境变量：`PORTABLE_EXECUTABLE_DIR` 等，可用于把用户数据写到 exe 旁实现「真·U 盘便携」。
  来源：<https://mintlify.wiki/electron-userland/electron-builder/packaging/windows>（Portable Environment Variables 小节）
- 体积预期：Electron 30 基线压缩包约 187MB / 实际典型 130–250MB（因每份应用内嵌完整 Chromium）；Live2D 模型（moc3+贴图）通常每模型再增 5–50MB。若体积敏感，同类项目有 Tauri 替代路线（Amica 用 Tauri、Kokoro Engine 用 Tauri v2 + Rust，安装包 5–40MB 量级），但 WebKitGTK 在 Linux 的渲染一致性是 Electron 支持者常提的取舍。
  来源：<https://johal.in/tauri-20-vs-electron-30-desktop-app-bundle>、<https://javascript-news.org/tauri-vs-electron-bundle-size-and-memory-footprint-in-2026>、<https://github.com/semperai/amica>、<https://github.com/chyinan/Kokoro-Engine>

#### 2.3.3 Linux AppImage 的 FUSE 依赖与兜底

- AppImage 运行依赖 FUSE；新系统（如 Ubuntu 22.04+ 默认不带 fuse2）常见报错「AppImages require FUSE to run」，官方解法为安装 libfuse2（`sudo apt-get install libfuse2`，注意是 libfuse2 而非 fuse）。
  来源：<https://docs.appimage.org/user-guide/troubleshooting/fuse.html>
- 无 FUSE 时的官方兜底：type-2 AppImage 内建「extract-and-run」——`./my.AppImage --appimage-extract-and-run`，或设 `APPIMAGE_EXTRACT_AND_RUN=1`（可加 `NO_CLEANUP=1` 复用解压目录）；也可手动 `--appimage-extract` 到 `squashfs-root` 后运行 AppRun。
  来源：<https://docs.appimage.org/user-guide/troubleshooting/fuse.html>
- 工程化建议：在 README/发布页写明 `chmod +x` 与 libfuse2 安装指引，或随包附一个 `run.sh` 自动尝试 FUSE、失败时回退 `--appimage-extract-and-run`（该参数可透传给 AppImage，也可作 Electron 启动参数包装）。

#### 2.3.4 Windows 未签名 exe 的 SmartScreen 现实

- 官方行为（Microsoft Learn）：SmartScreen 依据「发布者信誉 + 文件哈希信誉」拦截下载文件；**未签名 exe 首次运行显示「Windows protected your PC」，用户必须点「More info → Run anyway」**；企业策略可彻底禁止运行。且「unsigned files must build reputation anew with every update」——每个新版本都从零信誉开始。2024 年后 **EV 证书也不再首轮豁免**；微软推荐非商店分发出走 Artifact Signing（原 Trusted Signing，$9.99/月起）。Windows 11 的 Smart App Control 甚至会直接拦截无信誉未签名文件。
  来源：<https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation>
- 实测数据（第三方）：未签名期 Windows 安装完成率约 62%，加清晰引导（截图「More info → Run anyway」路径）可提到约 78%（签名应用基线 88–94%）；约 50–100 次干净安装、3 周左右警告开始消失。
  来源：<https://crawlix.app/blog/electron-unsigned-app-2026/>
- Electron 官方签名工具链：`@electron/windows-sign`（支持本地 pfx、云 HSM/EV 等）。
  来源：<https://github.com/electron/windows-sign>
- 先例：Open-LLM-VTuber 桌面客户端即未签名，官方文档承认首启有安全警告。
  来源：<https://deepwiki.com/Open-LLM-VTuber/open-llm-vtuber.github.io/6-frontend-components>
- 建议：个人/开源项目初期接受未签名 + README 图文化引导；成熟后接入 Artifact Signing 或 SignPath Foundation（开源免费签名，需信誉门槛）。

---

## 3. 同类开源项目参考

### 3.1 Open-LLM-VTuber（13.4k stars，最成熟的参照系）

- 定位：语音交互 AI 伴侣（复刻 neuro-sama 的开源尝试），Live2D 形象（支持 Cubism 5），可完全离线。
  来源：<https://github.com/Open-LLM-VTuber/Open-LLM-VTuber>、中文文档 <https://open-llm-vtuber.github.io/docs/intro/>
- **架构：前后端分离**。Python 后端（可本地可云端）+ React/TypeScript 前端；前端有三种形态——Web 模式（浏览器）、Window 模式与 **Desktop Pet 桌宠模式（后两者为 Electron 应用**：透明背景、置顶、鼠标穿透、可拖拽）。通信为 WebSocket（默认端口 12393，`/client-ws`），音频以二进制帧传输，表情/动作触发以 JSON 消息下发；Live2D 模型由后端静态托管并经 `model_dict.json` 配置（含 `emotionMap`、`tapMotions`、`kScale` 等）。
  来源：<https://open-llm-vtuber.github.io/en/docs/user-guide/frontend/mode/>、<https://deepwiki.com/Open-LLM-VTuber/open-llm-vtuber.github.io/6-frontend-components>、<https://deepwiki.com/Open-LLM-VTuber/open-llm-vtuber.github.io/6.2-live2d-model-integration>
- TTS/ASR 集成方式：配置文件切换模块（ASR：sherpa-onnx/FunASR/Faster-Whisper/Groq…；TTS：sherpa-onnx/MeloTTS/GPT-SoVITS/CosyVoice/Edge TTS/Fish Audio…），不改代码。
  来源：<https://github.com/Open-LLM-VTuber/Open-LLM-VTuber>
- Live2D 栈演进（重要参考）：从 `pixi-live2d-display-lipsync`（社区封装）迁移到**官方 Live2D Web SDK**——换来 Cubism 5 支持但失去 Cubism 2，且当时尚不支持 motionsync。
  来源：<https://github.com/Open-LLM-VTuber/Open-LLM-VTuber/releases>
- 可借鉴点：WebSocket 协议分频道（文本/音频/表情/系统事件）；emotionMap 数据结构；桌宠模式的 Electron 窗口技巧（`transparent`、`setIgnoreMouseEvents`、`-webkit-app-region: drag`）。

### 3.2 Amica（VRM 3D 路线的对照）

- 定位：浏览器优先的高度可定制 3D（VRM）AI 角色，语音 + 视觉 + 情绪引擎；Pixiv ChatVRM 的 fork；桌面端用 **Tauri**。
  来源：<https://github.com/semperai/amica>
- 架构文档：Chat / Voice / Avatar / Transcription / Expression / Visual 六系统；情绪驱动表情（blendshapes）与语音语调；LLM 可接 ChatGPT API、llama.cpp、Ollama、OpenRouter 等；STT 用浏览器 Whisper + Silero VAD；对外 API 以 SSE 提供实时连接。
  来源：<https://github.com/semperai/amica/blob/master/docs/overview/how-amica-works.md>、<https://github.com/semperai/amica/blob/master/docs/api/api-reference.md>
- 可借鉴点：情绪→表情→TTS 语调联动的设计；纯前端（Transformers.js 跑 Whisper/VAD）让「无后端部署」成立——与本项目「复制即用」目标契合（Electron 内置 Node 后端则更自由）。

### 3.3 Cyrene-Agent（Electron + Live2D 的直接同构案例）

- Windows 桌面 Live2D AI 伴侣：**Electron 43 + Vite 5 + TS + Pixi.js 7 + `pixi-live2d-display` 0.5.0-beta + Cubism Core**；7 个 BrowserWindow 多窗口架构（聊天/侧栏/任务/设置/贴纸/通话/桌宠）；Agent 通过 `play_live2d_action` 工具把「表情+动作+气泡」广播给桌宠（AG-UI 事件流）；记忆 L0/L1/L2 + Worldbook；多会话 JSON 持久化；TTS 多引擎、ASR 阿里云。
  来源：<https://github.com/VenQy/Cyrene-Agent>
- 可借鉴点：这是与本目标形态最接近的参考实现（Electron 内做完整 Agent + Live2D 表演），其 preload IPC 桥、模型目录（`dist/renderer/models/cyrene/` + MODEL_LICENSE.md 单独管理模型许可）与「默认无需本地模型即可聊天」的分级体验都值得对照。

### 3.4 其他可参照实现（一览）

| 项目 | 形态 | 关键参考点 | 来源 |
|---|---|---|---|
| SoulLink_Live2D | Python aiohttp + Vue3 + pixi-live2d-display v0.4 | LLM 直控表情参数、TTS 两阶段连续动作、模型热加载 | <https://github.com/nanlingyin/SoulLink_Live2D> |
| Lucie-AI | FastAPI + WebSocket + PixiJS 8 + Hiyori Pro | 情绪/手势标签协议、edge-tts 波形口型、磁盘记忆 | <https://github.com/vincenzo-afk/Lucie-AI> |
| LLM_Live2D | 纯前端（Vite+PixiJS+pixi-live2d-display） | 结构化 JSON 表情混合、运行时自动发现 exp3/参数白名单 | <https://github.com/entropy622/LLM_Live2D> |
| GeminiLive2d | Express + pixi-live2d-display（RaSan147 fork） | 音频驱动口型优化、多模型切换 | <https://github.com/kellyzxiaowei/GeminiLive2d> |
| Live2D-LLM-Chat | Python + live2d-py(OpenGL) | 桌面端非浏览器渲染路线；振幅→口型 | <https://github.com/suzuran0y/Live2D-LLM-Chat/blob/main/README_CN.md> |
| Kokoro Engine | Tauri v2 + Rust + SQLite + PixiJS/Cubism | 三层记忆、MOD 沙箱、Live2D EULA 合规声明写法 | <https://github.com/chyinan/Kokoro-Engine> |
| EchoBot | Web + QQ/Telegram 接入 | 决策-扮演-执行三层架构隔离角色扮演与工具调用 | <https://github.com/kevinegf/EchoBot> |
| zoollcar/live2d-AI-chat | 前端 WebLLM + 后端代理 | 纯浏览器 LLM（WebLLM）+ 模型/表情/动作切换 | <https://github.com/zoollcar/live2d-AI-chat> |

**共性结论**：成熟项目普遍「聊天生成」与「表演驱动」分离、通信走 WebSocket/SSE、Live2D 资源独立目录管理并单独声明许可；桌面封装上 Electron（Open-LLM-VTuber、Cyrene-Agent、Elino）与 Tauri（Amica、Kokoro Engine）各有阵营。

---

## 4. 风险与未知项 / 需向用户澄清的问题清单

### 4.1 术语语义（最高优先级）

1. **「JEV」是否指 TypeSafe AI 的 Jev 模型（System One）？** 证据指向它（2026-09 新发布、擅长类型化情绪/决策判断、可与 SoulLink planner 概念互补），但拼写为全大写，也可能是别的缩写/内部代号/小项目。若是 Jev：是否已拿到 early access 资格（waitlist）？还是经 Vercel AI Gateway / OpenRouter 使用？
2. **「SoulLink」是指 `nanlingyin/SoulLink_Live2D`（及其 `@soullink-emotion` SDK）吗？** 还是商业 App soullink.ai（3D AI 伴侣）的「分层记忆系统」概念，或用户想把这套记忆/人格机制搬到 Live2D 工具上？这决定是否直接引入 `@soullink-emotion/*` npm 包、还是仅借鉴其 VAD/FACS 思路自研。
3. 「JEV + SoulLink」的组合关系：Jev 负责情绪分类/决策、SoulLink 负责表演引擎、另配聊天 LLM——这个三方分工是否符合预期？（还是 Jev 负责其他环节？）

### 4.2 Live2D 许可风险

4. **产品是否允许用户导入自己的 Live2D 模型？** 若是，很可能构成 Live2D 定义的 **Expandable Application**，即使个人开发者也需通过 Live2D 审查并签订特别 Publication License（原则上要求营收模式，完全免费原则上不批）。若仅内置固定模型则个人/小企业豁免。
   来源：<https://www.live2d.com/en/sdk/license/expandable/>、<https://www.live2d.com/en/sdk/license/>
5. 内置模型选官方示例（Hiyori 等，需遵守「不改设计」等附加条款、不含官方音频）还是自制/购买商用授权模型？再分发条款已在 2.1.3 梳理。
6. Cubism Core（`live2dcubismcore.min.js`）随应用分发时须接受 Live2D Proprietary Software License；不要使用官方明确警告「不可靠、勿用于生产」的 CDN 直链，应本地打包。
   来源：<https://github.com/guansss/pixi-live2d-display>（README 关于 Core 直链的警告）

### 4.3 技术未知项

7. 渲染层选型待定：跟随 SoulLink SDK 的 PIXI v7 + pixi-live2d-display 线（兼容旧模型、与 SDK 无缝）还是 Pixi v8 + Cubism 5-only 的新引擎（`untitled-pixi-live2d-engine`）？取决于需要支持的模型版本范围。
8. Jev 的接入形态：其原生 API 并非 OpenAI 兼容 chat 接口（独立 `/systemone` 端点）；若走 Vercel AI Gateway / OpenRouter 则统一到现有网关。需要一个小适配层把「情绪 Choice 问题」发给 Jev。
   来源：<https://vercel.com/docs/ai-gateway/sdks-and-apis/typesafe>、<https://pypi.org/project/jev-cli/0.6.2/>
9. API key 的存放与代理位置（Electron 主进程 IPC 桥 vs 渲染进程直连）——安全与便携的权衡。
10. Windows 分发的 SmartScreen 期策略：未签名 + 引导文案，还是尽早接 Artifact Signing（$9.99/月起）/SignPath 开源签名？
    来源：<https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation>、<https://crawlix.app/blog/electron-unsigned-app-2026/>
11. Linux 目标用户的主流发行版假设：若包含 Ubuntu 22.04+/Debian 新版等无 fuse2 环境，需在发布物中内置 `--appimage-extract-and-run` 兜底说明或启动脚本。
    来源：<https://docs.appimage.org/user-guide/troubleshooting/fuse.html>
12. 是否需要 TTS/ASR 第一版就上（edge-tts 起步）？纯文字版可先验证「聊天+表情驱动」主链路。

### 4.4 本次调研未覆盖/未深入

- OpenAI 兼容 API 的 SSE 细节实现（视为团队已知常识，未单独取证官方 reference）。
- GPT-SoVITS / kokoro 的部署细节与资源开销（仅概览）。
- macOS 打包（用户目标只有 Windows/Linux，未调研 notarization 等）。
- SoulLink_Live2D / soullink-emotion-sdk 的 star 数、issue 活跃度等健康度指标未逐项核实（README 与 npm 页面可见性良好，但项目较新、需自行评估长期维护风险）。
- `live2d-widget`（stevenjoezhang 经典博客挂件）未单独取证——它只支持 Cubism 2 且面向网页挂件场景，与本目标相关性低。

---

## 附：核心来源索引（按主题）

**Jev / TypeSafe**
- 官方发布博客：<https://typesafe.ai/blog/introducing-system-one-models-and-jev>
- 官方文档（Introduction / llms.txt）：<https://docs.typesafe.ai/introduction.md>
- Vercel AI Gateway 接入：<https://vercel.com/docs/ai-gateway/sdks-and-apis/typesafe>
- pydantic-ai 集成：<https://pydantic.dev/docs/ai/models/typesafe/>
- jev-cli（OpenRouter 可用性）：<https://pypi.org/project/jev-cli/0.6.2/>

**SoulLink**
- SoulLink_Live2D 仓库：<https://github.com/nanlingyin/SoulLink_Live2D>
- soullink-emotion-sdk 仓库：<https://github.com/nanlingyin/soullink-emotion-sdk>
- npm：engine <https://www.npmjs.com/package/@soullink-emotion/engine> / planner-openai <https://www.npmjs.com/package/@soullink-emotion/planner-openai> / profile-generator <https://www.npmjs.com/package/@soullink-emotion/profile-generator> / live2d-pixi <https://www.pkgstats.com/pkg:@soullink-emotion/live2d-pixi>
- 商业 App（干扰项）：<https://soullink.ai/>、<https://blog.getsoullink.com/what-is-soullink-everything-you-need-to-know-about-the-ai-companion-built-around-one-friend/>

**Live2D 渲染与许可**
- pixi-live2d-display 原版：<https://github.com/guansss/pixi-live2d-display>（含 wiki <https://github.com/guansss/pixi-live2d-display/wiki/Complete-Guide>、维护状态 issue <https://github.com/guansss/pixi-live2d-display/issues/181>、lipsync PR <https://github.com/guansss/pixi-live2d-display/pull/117>）
- RaSan147 lipsyncpatch：<https://github.com/RaSan147/pixi-live2d-display/>；Sekai-World 线：<https://github.com/Sekai-World/pixi-live2d-display>
- Pixi v8/Cubism5：<https://github.com/Untitled-Story/untitled-pixi-live2d-engine>、<https://github.com/naari3/pixi-live2d-display>、<https://github.com/omniwaifu/pixi-live2d5>
- oh-my-live2d / l2d：<https://oml2d.hacxy.cn/>、<https://github.com/hacxy/l2d-widget>、<https://github.com/hacxy/l2d>
- Live2D SDK 许可：<https://www.live2d.com/en/sdk/license/>、<https://help.live2d.com/en/sdk/sdk_001/>、<https://www.live2d.com/en/sdk/license/expandable/>、<https://www.live2d.com/en/sdk/license/purchase_plan01/>
- 示例模型条款：<https://www.live2d.com/eula/live2d-free-material-license-agreement_en.html>、<https://www.live2d.com/en/learn/sample/model-terms/>、<https://www.live2d.com/en/learn/sample/momose-hiyori-video/>、<https://help.live2d.com/en/other/other_16/>、<https://github.com/Live2D/CubismNativeSamples/blob/4-r.1/LICENSE.md>

**Electron 打包**
- electron-builder 配置（portable / AppImage / asar / asarUnpack）：<https://www.electron.build/docs/configuration/>、<https://www.electron.build/docs/targets/>、<https://www.electron.build/docs/linux>、<https://www.electron.build/electron-builder.interface.platformspecificbuildoptions>
- portable 环境变量：<https://mintlify.wiki/electron-userland/electron-builder/packaging/windows>
- AppImage FUSE：<https://docs.appimage.org/user-guide/troubleshooting/fuse.html>
- SmartScreen：<https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation>、实测 <https://crawlix.app/blog/electron-unsigned-app-2026/>、签名工具 <https://github.com/electron/windows-sign>
- 体积对比：<https://johal.in/tauri-20-vs-electron-30-desktop-app-bundle>、<https://javascript-news.org/tauri-vs-electron-bundle-size-and-memory-footprint-in-2026>

**同类项目**
- Open-LLM-VTuber：<https://github.com/Open-LLM-VTuber/Open-LLM-VTuber>、文档 <https://open-llm-vtuber.github.io/docs/intro/>、前端模式 <https://open-llm-vtuber.github.io/en/docs/user-guide/frontend/mode/>、Live2D 集成分析 <https://deepwiki.com/Open-LLM-VTuber/open-llm-vtuber.github.io/6.2-live2d-model-integration>、release（SDK 迁移记录）<https://github.com/Open-LLM-VTuber/Open-LLM-VTuber/releases>
- Amica：<https://github.com/semperai/amica>、架构 <https://github.com/semperai/amica/blob/master/docs/overview/how-amica-works.md>
- Cyrene-Agent：<https://github.com/VenQy/Cyrene-Agent>
- 其余见 3.4 表格内链接。
