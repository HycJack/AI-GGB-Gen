# 校验门（ggbcheck WASM）

GeoGebra 指令脚本在执行前会先过一道静态校验。校验器是
[`geogebra-dsl-go`](https://github.com/hycjack/geogebra-dsl-go) 的 `ggbcheck`，
交叉编译成 WebAssembly 后直接在浏览器里跑，不需要任何后端。

```
题目 ──▶ 模型（只输出指令） ──▶ ggbcheck ──▶ 通过 ──▶ GeoGebra 执行
                                     │
                                     └── 不通过：诊断回喂 ──▶ 模型重写（最多 3 次）
```

## 校验阶段

脚本按下面顺序处理，任何一阶段失败都会中止并返回 `OK=false`：

1. **语法解析** — 逐行解析 `对象名 = 定义`、裸命令、`//` 与 `#` 注释
2. **签名匹配** — 命令名与参数个数、类型对命令表（587 条）
3. **依赖图** — 收集对象引用，构建有向图
4. **环检测** — 循环依赖无法构造
5. **重定义检测** — 同一对象名重复定义
6. **未定义引用检测** — 引用了从未定义的对象
7. **退化几何检测** — 重合点确定直线、零半径圆等无法构造的情形
8. **可达性检测** — 构造是否可能完成

## 错误码

| 码 | 含义 |
| --- | --- |
| `parse/syntax` | 该行不是合法的指令语法 |
| `cmd/unknown` | 命令名不在命令表里（会附相近命令提示） |
| `cmd/arg` | 参数个数或类型不匹配（附正确签名） |
| `dep/cycle` | 循环依赖 |
| `dep/redefine` | 对象名重复定义 |
| `dep/undefined` | 引用了未定义的对象 |
| `geo/degenerate` | 退化构造 |
| `goal/unreachable` | 目标不可达 |

`cmd/arg` 的诊断会直接给出**正确签名**，例如：

```
[cmd/arg] B 命令 Point 的参数个数或类型不匹配任何签名；正确签名：Point(<Object>)；
Point(<Object>, <Parameter>)；Point(<Point>, <Vector>)；…
这些参数都是数字/布尔字面量，但匹配到的重载要的是对象引用——
构造点请写 A = (x, y) 或 A = (x, y, z)
```

这类"告诉模型该怎么写"的诊断是修复循环能收敛的关键——只报"错了"无法收敛。

## 修复循环

`src/lib/gemini.ts` 的 `runValidationLoop`：

- 首轮请求只要求模型输出指令
- 校验失败时把诊断拼进下一轮用户消息，要求按诊断改写
- 最多 `MAX_ATTEMPTS = 3` 轮，取最后一次通过的版本；3 轮仍不通过则返回最后一版
  并标记为失败，脚本仍会尝试执行并在界面上标红
- 诊断通过 `formatProblems()` 格式化成一行一条，人和模型都能读

## WASM 绑定

`src/lib/ggbValidate.ts`：

- `loadValidator()` — 单例。先注入 `ggbcheck.js`（Go 的 `wasm_exec.js`），
  再 `fetch` 二进制并 `WebAssembly.instantiate`
- 页面启动 2 秒后预热，`ggbWarmup()` 提前解析命令表，避免首次校验时卡顿
- `normalize()` — Go 侧空切片序列化为 `null`，这里统一成 `[]`，调用方不必写 `?? []`
- `validateScript()` — Go 侧是同步调用（毫秒级，首次解析命令表约 16ms），
  会先让出一次事件循环避免饿死待执行的绘制

体积：`ggbcheck.wasm` 5,207,372 B，`ggbcheck.js` 16,992 B。

## 视角推断

`perspectiveFor(receipt, commands)` 决定打开 GeoGebra 的哪个视角，
依据是校验器解析出的对象 `kinds`，不依赖模型自述：

| 判定 | 视角 |
| --- | --- |
| 出现 `Plane` / `Quadric` / `Solid` / `Polyhedron` | `'5'`（3D） |
| 出现三维字面量点 `A = (0, 0, 0)` | `'5'`（3D） |
| 出现 `Function` 或 `f(x) = …` | `'1'`（代数与图形） |
| 其他 | `'2'`（几何） |

## 重建 WASM

`public/wasm/` 下的两个文件是构建产物，由 Go 仓库生成：

```bash
cd ~/Downloads/geogebra-like/geogebra-dsl-go
go test ./...   # 先确认全绿

GOCACHE=$PWD/.gocache \
  GOOS=js GOARCH=wasm \
  go build -trimpath -ldflags="-s -w" \
  -o /path/to/AI-GGB-Gen/public/wasm/ggbcheck.wasm \
  ./cmd/ggbcheck-wasm

# wasm_exec.js 每次 Go 大版本更新后需要重新拷贝
cp "$(go env GOROOT)/lib/wasm/wasm_exec.js" \
  /path/to/AI-GGB-Gen/public/wasm/ggbcheck.js
```

然后在前端 `npm run build`。校验器导出两个函数：`ggbValidate(script, forceSource?)`
和 `ggbWarmup()`。

## 执行侧的懒加载重试

校验通过不等于执行一定成功。web3d applet 对离散数学类命令（`TriangleCenter`、
`Voronoi`、`Hull`、`Barycenter`、`Cubic`、`TriangleCurve` 等）走 `GWT.runAsync`
按需加载，**首次同步 `evalCommand()` 会抛 `CommandNotLoadedError`，而这一次失败调用
正是触发加载的动作**。所以 `src/components/GeoGebra.tsx` 的 `runCommand` 会在匹配到
"未加载"特征的错误后，按 400 / 900 / 1500 ms 重试三次；非懒加载错误立即返回，
不会被重试掩盖。`runCommands` 顺序 `await` 每条命令，保证依赖顺序。

## 已知缺口

- **`Button(<Caption>, <Script>)` 未收录** — 命令表只有单参 `Button(<Caption>)`，
  双参形式被判为 `cmd/arg`；而且校验器会把脚本字符串误解析成假对象
  （`Button("播放","StartAnimation(a)")` 会产生 `b.StartAnimation1`），
  所以直接加 overload 会引入脏数据。需要时用 `StartAnimation` 直接驱动。
- **下划线对象名放行** — 下划线在 GeoGebra 中是合法语法（下标标记），
  且校验器自己的标签预测在字母表耗尽时也会产生 `A_1`、`B_1`，
  因此判为错误会误伤合法脚本。前端靠提示词约束，不做校验拦截。
- **`cmdmeta.json` 仍引用 8 条未收录命令** — `ELLIPSOID`、`HEXAHEDRON`、
  `HYPERBOLOID`、`QUADRIC`、`PARALLELPLANE`、`CIRCLEBYRADIUSM`、`LIST`、`MATRIX`。
  前六个是 3D 曲面命令，缺权威签名，补了会造出假阳性，宁可留空。
