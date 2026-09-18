<div align="center">
<img width="1200" height="475" alt="GGB Banner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />

# AI-GGB-Gen

**题目 → GeoGebra 动态几何课件**

输入一道数学题（或描述一个图形），AI 直接生成可在 GeoGebra 中执行的指令脚本；
脚本经 `ggbcheck`（WebAssembly）静态校验，不通过则带诊断自动重生成，最多重试 3 次。
生成的脚本以可拖动点、滑移线、动态文本、自动播放的形式呈现，可以当作课堂演示课件使用。
</div>

## 功能

- **题目驱动生成** — 自然语言题目（或上传图片）转成 GeoGebra 指令脚本
- **WASM 校验门** — 每条脚本先过 `ggbcheck` 静态校验（587 条命令表、签名匹配、依赖拓扑、退化构造、可达性），错误原样回喂模型重写
- **交互课件** — 生成结果带可拖动点、滑移线参数、动态文本、`StartAnimation` 自动播放，可直接课堂演示
- **2D / 3D 视角自动切换** — 由校验器解析出的对象 `kinds` 决定，不依赖模型自述
- **脚本编辑器** — 手动编辑、逐行执行、即时校验状态条、AI 局部修改（片段与上下文合并后校验）
- **会话管理** — 历史会话、缩略图回放、一键恢复 2D/3D 视角；localStorage 持久化，配额超限自动降级

## 快速开始

**前置条件：** Node.js 20+

```bash
npm install
npm run dev
```

打开 http://localhost:3000 ，点右上角齿轮图标填入 API key（存在 localStorage，不需要 `.env`）。

端口被占用时可以指定：`npm run dev -- --port=3001`

```bash
npm run lint     # tsc --noEmit（strict）
npm run build    # 生产构建
npm run preview  # 预览构建产物
```

## 配置

| 项 | 说明 |
| --- | --- |
| **API Key** | 齿轮图标填写，存 localStorage |
| **Base URL** | 兼容 OpenAI 协议的任意端点。留空时回落到 `https://api.openai.com/v1`；尾部斜杠会自动裁掉 |
| **Model** | 兼容 OpenAI 的模型名，如 `gpt-4o`、`deepseek-v4` |

### 跨域说明

`Authorization` 与 `Content-Type: application/json` 都不是"简单请求"头，浏览器会先发 `OPTIONS` 预检。
若你的模型服务不支持 CORS，前端请求会在网络层失败（报「无法请求大模型服务，请检查 baseUrl 是否可跨域访问」）。
两个解法：给服务端加 `Access-Control-Allow-Origin` 等头，或者在服务端前面放一层代理。
本项目自带的 `GET /models` 已经去掉了 `Content-Type`，避免触发无谓的预检。

## 工作原理

```
题目 ──▶ 模型（只输出指令） ──▶ ggbcheck (WASM) ──▶ 通过 ──▶ GeoGebra 执行
                                        │
                                        └── 不通过：诊断回喂 ──▶ 模型重写（最多 3 次）
```

提示词约束模型**只输出 GeoGebra 指令**，不要任何解释、JSON 信封或标题。
校验失败时，把 `ggbcheck` 的诊断（含正确签名）原样拼进下一轮请求，让模型据此收敛——
校验器给的是「应该怎么写」，不只是「写错了」。

校验器错误码：`parse/syntax`、`cmd/unknown`、`cmd/arg`、`dep/cycle`、`dep/redefine`、
`dep/undefined`、`geo/degenerate`、`goal/unreachable`。
详见 `docs/VALIDATION.md`。

## 交互课件

构造类和演示类题目会优先生成可交互的课件。GeoGebra 里"交互"靠四样东西：

| 手段 | 写法 | 效果 |
| --- | --- | --- |
| 可拖动点 | `A = (1, 0)` | 自由点默认可拖动，依赖它的图形实时更新 |
| 滑移线参数 | `a = 1` | 自由数字在代数区生成滑移线，写进公式即联动 |
| 动态文本 | `t = Text("斜率 = " + a, (3, 4))` | 数值变化时文本同步刷新 |
| 自动播放 | `StartAnimation(a)` | 滑移线自动往复变化（放脚本最后一行） |

例子——一次函数课件：

```
a = 1
b = 0
f(x) = a*x + b
t1 = Text("斜率 = " + a, (3.2, 4))
t2 = Text("截距 = " + b, (3.2, 3))
StartAnimation(a)
```

拖动 `a` 或 `b` 的滑移线，直线与两个文本同步变化；`StartAnimation` 让斜率自动往复。
纯计算题（求值、解方程、求根）不强行加交互。

> 注意：对象名不要带下划线。下划线在 GeoGebra 里是下标标记，
> `A_1` 会渲染成 A₁、`mid_point` 会渲染成「mid」带下标「point」。

## 项目结构

```
public/wasm/            ggbcheck 校验器（WASM 构建产物，见 docs/VALIDATION.md）
  ggbcheck.wasm         5.2 MB，由 geogebra-dsl-go 交叉编译
  ggbcheck.js           Go wasm_exec.js
src/
  App.tsx               主界面：生成、校验、执行、会话管理
  components/
    GeoGebra.tsx        GeoGebra classic applet 封装（含懒加载命令重试）
    ScriptEditor.tsx    脚本编辑器：校验按钮、状态条、AI 局部修改
    SettingsModal.tsx   API 配置
    HistoryModal.tsx    历史会话
  lib/
    gemini.ts           提示词、请求层、校验-修复循环
    ggbValidate.ts      WASM 加载单例、Receipt 归一化、错误格式化、视角推断
    storage.ts          localStorage 持久化与配额降级
  hooks/useEscapeClose.ts
```

## 已知限制

- **执行失败静默** — `evalCommand` 抛错时执行器只 `console.error`，画面上不会立刻提示
  （`runCommands` 会汇总后弹一个 alert）。懒加载命令（`GWT.runAsync`）会在 400/900/1500ms
  三次重试后才判定失败。
- **模型服务不可跨域直连** — 见上文跨域说明，需要服务端支持 CORS 或前置代理。
- **`Button(<Caption>, <Script>)` 未收录** — 校验器只认单参 `Button(<Caption>)`，带脚本的双参
  形式会被判为 `cmd/arg`。需要时用 `StartAnimation` 直接驱动。
- **历史会话不自动迁移** — 提示词更新只影响新生成；旧脚本里已有的下划线对象名保留原样，
  校验器会放行（下划线在 GeoGebra 中是合法语法）。

## 相关项目

- `geogebra-dsl-go` — 校验器实现，本项目的 WASM 由它交叉编译生成
