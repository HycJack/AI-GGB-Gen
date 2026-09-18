import {
  formatProblems,
  perspectiveFor,
  validateScript,
  type GGBProblem,
  type GGBReceipt,
} from './ggbValidate';

// The model is asked for commands only, then the GeoGebra script is validated
// by ggbcheck (compiled to WebAssembly, see ggbValidate.ts) and, when it fails,
// the diagnostics are fed back for a corrected rewrite. The loop stops on the
// first script that passes, or after MAX_ATTEMPTS whichever comes first.
const MAX_ATTEMPTS = 3;

const SYSTEM_PROMPT = `你是 GeoGebra 指令生成器。只输出 GeoGebra 指令脚本本身。不要输出解释、分析、标题、编号、Markdown 代码围栏或任何非指令文本。

语法：每行一条，形式为「对象名 = 定义」。
- 点：A = (0, 2)          三维点：A = (1, 2, 3)
- 直线：l = Line(A, B)
- 线段：s = Segment(A, B)
- 射线：r = Ray(A, B)
- 圆：c = Circle(A, 3)
- 多边形：tri = Polygon(A, B, C)
- 函数：f(x) = 2x + 1
- 数字：r = 3.5
- 列表：pts = {A, B, C}
- 常用命令：Midpoint, PerpendicularBisector, AngleBisector, Incenter, Circumcenter, Centroid, Orthocenter, Intersect, Reflect, Rotate, Translate, Dilate, Distance, Area, Angle, Slope, Tangent, PerpendicularLine, ParallelLine, Vector, Dot, Cross, Length, Abs, Sqrt, Sin, Cos, Ln, Log
- 注意命名差异：垂直平分线是 PerpendicularBisector（不是 PerpBisector），过点垂线是 PerpendicularLine（不是 Perpendicular），平行线是 ParallelLine（不是 Parallel），向量长度是 Length（不是 Norm）。
- 对象名只用字母和数字：A、B、l、s、r、tri、f、mid、center。不要用下划线。

硬性规则：
1. 有返回值的对象必须写成「对象名 = 命令(参数)」，例如 l = Line(A, B)；不能写成 Line(A, B)。
2. 只有绘图修饰类命令可以不带等号，例如 ShowAxes(false)、ShowGrid(false)、SetLineStyle(l, 1)、ShowLabel(A, false)。
3. 点的坐标必须用圆括号字面量 A = (0, 2)，不要写成 A = Point(0, 2)。
4. 只使用官方 GeoGebra 命令，参数个数与类型必须与官方签名一致。
5. 被引用的对象必须先定义，不要重复定义同一个对象名。
6. 不要产生退化构造：两个重合点无法确定一条直线，圆的半径必须大于 0。
7. 需要隐藏坐标轴和网格时，在脚本最后加 ShowAxes(false) 和 ShowGrid(false)。
8. 有等价的基础命令时优先用基础命令，不要用冷门命令。冷门命令在 web3d applet 里是按需加载的，首次调用会失败一次（执行器会自动重试，但脚本越简单越稳）：TriangleCenter 等离散数学命令、Voronoi、Hull、Cubic、TriangleCurve、StDev、TextBox、Correlation、RegularPolygon、Quadric 一类的命令，能改用 Line、Intersect、Polygon、CorrelationCoefficient、Text、Textfield 等基础命令就改。
9. 对象名禁止下划线。下划线在 GeoGebra 里是下标标记，A_1 会渲染成 A₁、mid_point 会渲染成「mid」带下标「point」，名称难辨，还会和自动生成的标签（字母表耗尽后的 A_1、B_1）混淆。用 A、B、C、l、tri、mid、center、f 这类无下划线的短名。`;

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

/**
 * The app starts with an empty baseUrl, which previously made /chat/completions
 * resolve against the app's own origin while /models fell back to OpenAI — two
 * different hosts for the same key. Both paths now resolve the same way.
 * Trailing slashes are trimmed so a typed "…/v1/" does not produce "…/v1//chat/completions".
 */
function resolveBaseUrl(config: OpenAIConfig): string {
  return config.baseUrl.trim().replace(/\/+$/, '') || DEFAULT_BASE_URL;
}

export interface OpenAIConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export type Perspective = '1' | '2' | '5';

type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

/** Conversational message shape shared with the UI and session storage. */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

type ChatRequestMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | ChatContentPart[] }
  | { role: 'assistant'; content: string };

/** One attempt of the generate → validate → repair loop. */
export interface ValidationRound {
  attempt: number;
  ok: boolean;
  commands: string[];
  errors: GGBProblem[];
}

export interface ValidationReport {
  ok: boolean;
  attempts: number;
  errors: GGBProblem[];
  /** Object ids in topological build order (empty when the script failed). */
  executable: string[];
  rounds: ValidationRound[];
  /** True when the validator could not be loaded and no checking happened. */
  unavailable: boolean;
}

export interface GeoGebraGenerationResult {
  commands: string[];
  perspective: Perspective;
  validation: ValidationReport;
}

/** Result of an AI modification: the replacement lines plus the receipt for
 *  the merged script, which is what was actually validated. */
export interface GeoGebraModificationResult {
  fragment: string[];
  validation: ValidationReport;
}

export async function makeOpenAIRequest(endpoint: string, config: OpenAIConfig): Promise<Response> {
  // No Content-Type header: a GET with one is not a "simple request", so the
  // browser would fire a CORS preflight just to list models.
  const url = `${resolveBaseUrl(config)}${endpoint}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
    },
  });

  return response;
}

export async function makeOpenAIChatRequest(
  messages: ChatRequestMessage[],
  config: OpenAIConfig,
  options?: { temperature?: number; maxTokens?: number; responseFormat?: { type: string } }
): Promise<string> {
  const url = `${resolveBaseUrl(config)}/chat/completions`;
  const body: any = {
    model: config.model,
    messages: messages,
  };
  
  if (options?.maxTokens) {
    body.max_tokens = options.maxTokens;
  }
  if (options?.responseFormat) {
    body.response_format = options.responseFormat;
  }
  if (options?.temperature !== undefined) {
    body.temperature = options.temperature;
  }
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`大模型服务返回 ${response.status}: ${errorText.slice(0, 300)}`);
  }
  
  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

export async function getAvailableModels(apiKey: string, baseUrl?: string): Promise<string[]> {
  try {
    const config: OpenAIConfig = { apiKey, baseUrl: baseUrl || '', model: '' };
    const response = await makeOpenAIRequest('/models', config);
    
    if (!response.ok) {
      console.error("Failed to list models:", response.status);
      return [];
    }
    
    const data = await response.json();
    const models: string[] = [];
    
    if (data.data && Array.isArray(data.data)) {
      for (const model of data.data) {
        if (model.id) {
          models.push(model.id);
        }
      }
    }
    
    return models.sort();
  } catch (error) {
    console.error("Failed to list models:", error);
    return [];
  }
}

export async function generateGeoGebraCommands(
  problemText: string,
  imageBase64: string | undefined,
  mimeType: string = "image/jpeg",
  config: OpenAIConfig
): Promise<GeoGebraGenerationResult> {
  const userContent: ChatContentPart[] = [{ type: 'text', text: problemText }];
  if (imageBase64) {
    userContent.push({
      type: 'image_url',
      image_url: { url: `data:${mimeType};base64,${imageBase64}` },
    });
  }

  try {
    const { script, receipt, report } = await runValidationLoop(userContent, config);
    return {
      commands: script,
      perspective: perspectiveFor(receipt, script),
      validation: report,
    };
  } catch (error) {
    // Re-throw so callers can tell a real failure apart from an empty result.
    throw new Error(
      `生成 GeoGebra 指令失败: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * AI modification of a selected fragment. `contextBefore` and `contextAfter`
 * are the script text outside the selection: the fragment is validated inside
 * that context, because references to objects defined elsewhere would
 * otherwise look undefined.
 */
export async function modifyGeoGebraCommands(
  contextBefore: string,
  contextAfter: string,
  selectedScript: string,
  userInstruction: string,
  config: OpenAIConfig
): Promise<GeoGebraModificationResult> {
  const fullScript = [contextBefore, selectedScript, contextAfter]
    .filter((part) => part.trim() !== '')
    .join('\n');

  const userContent: ChatContentPart[] = [
    {
      type: 'text',
      text: [
        `当前 GeoGebra 脚本：`,
        fullScript,
        '',
        `其中需要修改的部分：`,
        selectedScript,
        '',
        `用户修改要求：${userInstruction}`,
        '',
        '只输出修改后的脚本片段，用于原样替换上面「需要修改的部分」。',
        '片段里的对象名必须与当前脚本保持一致，对外部对象的引用不要改变。',
      ].join('\n'),
    },
  ];

  try {
    const { script, report } = await runValidationLoop(userContent, config, {
      buildFull: (fragment) =>
        `${contextBefore.trimEnd()}\n${fragment.join('\n')}\n${contextAfter.trimStart()}`.trim(),
    });
    return { fragment: script, validation: report };
  } catch (error) {
    throw new Error(
      `AI 修改指令失败: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Generate → validate → repair. The conversation grows by one assistant turn
 * and one diagnostics turn per failed attempt, so the model sees its own
 * previous output alongside what the validator found wrong with it.
 */
async function runValidationLoop(
  firstUser: ChatContentPart[],
  config: OpenAIConfig,
  opts?: { buildFull?: (fragment: string[]) => string }
): Promise<{ script: string[]; receipt: GGBReceipt; report: ValidationReport }> {
  const messages: ChatRequestMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: firstUser },
  ];
  const rounds: ValidationRound[] = [];
  let script = '';
  let split: string[] = [];
  let receipt: GGBReceipt = emptyReceipt();

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const raw = await makeOpenAIChatRequest(messages, config);
    script = extractScript(raw);
    split = splitCommands(script);

    const target = opts?.buildFull ? opts.buildFull(split) : script;
    try {
      receipt = await validateScript(target);
    } catch (error) {
      console.error('GeoGebra 校验器不可用:', error);
      return { script: split, receipt, report: unavailableReport(attempt, rounds) };
    }

    rounds.push({
      attempt,
      ok: receipt.ok,
      commands: split,
      errors: receipt.errors,
    });

    if (receipt.ok) {
      return { script: split, receipt, report: finishReport(receipt, rounds) };
    }
    if (attempt < MAX_ATTEMPTS) {
      messages.push({ role: 'assistant', content: script });
      messages.push({ role: 'user', content: repairPrompt(script, receipt) });
    }
  }

  return { script: split, receipt, report: finishReport(receipt, rounds) };
}

/** Pull the instruction script out of whatever the model actually returned. */
function extractScript(raw: string): string {
  let text = raw.trim();

  const fence = text.match(/^```[^\n]*\n([\s\S]*?)\n```$/);
  if (fence) text = fence[1].trim();

  try {
    const obj = JSON.parse(text) as Record<string, unknown>;
    if (obj && typeof obj === 'object') {
      for (const key of ['script', 'commands', 'code']) {
        const value = obj[key];
        if (typeof value === 'string' && value.trim()) return value.trim();
        if (Array.isArray(value)) {
          const joined = value.filter((v): v is string => typeof v === 'string').join('\n').trim();
          if (joined) return joined;
        }
      }
    }
  } catch {
    // Not JSON — treat the whole reply as the script.
  }

  return text;
}

function splitCommands(script: string): string[] {
  return script
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#') && !line.startsWith('//'));
}

function repairPrompt(script: string, receipt: GGBReceipt): string {
  return [
    '你上一版脚本没有通过 GeoGebra 指令校验器 ggbcheck 的检查。',
    '',
    '上一版脚本：',
    '<<<',
    script,
    '>>>',
    '',
    '校验器诊断（逐条）：',
    formatProblems(receipt.errors),
    '',
    '请根据诊断修正，重新输出完整的指令脚本。注意：',
    '- 修正全部诊断列出的问题，不要只改其中一条。',
    '- 输出完整脚本，不要只输出修改过的行。',
    '- 仍然只输出指令，不要解释、不要代码围栏。',
  ].join('\n');
}

function finishReport(receipt: GGBReceipt, rounds: ValidationRound[]): ValidationReport {
  return {
    ok: receipt.ok,
    attempts: rounds.length,
    errors: receipt.errors,
    executable: receipt.executable,
    rounds,
    unavailable: false,
  };
}

function unavailableReport(attempt: number, rounds: ValidationRound[]): ValidationReport {
  return {
    ok: false,
    attempts: attempt,
    errors: [],
    executable: [],
    rounds,
    unavailable: true,
  };
}

function emptyReceipt(): GGBReceipt {
  return {
    ok: false,
    errors: [],
    warnings: [],
    executable: [],
    kinds: {},
    sourceIn: 'text',
  };
}
