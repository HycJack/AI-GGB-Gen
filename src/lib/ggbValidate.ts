// Binding to the ggbcheck validator, compiled to WebAssembly from
// github.com/hycjack/geogebra-dsl-go (cmd/ggbcheck-wasm). It runs the full
// GeoGebra instruction pipeline — syntax, signature, dependency graph, cycle,
// degeneracy and reachability — entirely in the browser, with the 582-command
// official command table embedded in the module.
//
// The Go side is synchronous, so a validation call blocks the main thread for a
// few milliseconds (the first one parses the ~1 MB embedded command table).
// validateScript() yields to the event loop first so a pending repaint is not
// starved; anything longer would need a Web Worker.

export interface GGBProblem {
  code: string;
  msg: string;
  obj?: string;
  line?: number;
}

export interface GGBReceipt {
  ok: boolean;
  errors: GGBProblem[];
  warnings: GGBProblem[];
  executable: string[];
  /** Object id -> resolved coarse kind ("Point", "Line", "Plane", ...). */
  kinds: Record<string, string>;
  sourceIn: string;
}

interface GGBExport {
  receipt: GGBReceipt;
  script: string;
}

type Validator = (script: string) => GGBExport;

declare global {
  interface Window {
    /** Set by public/wasm/ggbcheck.js (the Go wasm_exec loader). */
    Go?: new () => {
      importObject: WebAssembly.Imports;
      run(instance: WebAssembly.Instance): Promise<void>;
    };
    /** Registered by cmd/ggbcheck-wasm/main.go. */
    ggbValidate?: (script: string, forceSource?: string) => string;
    ggbWarmup?: () => string;
  }
}

const base = import.meta.env.BASE_URL;
const WASM_LOADER = `${base}wasm/ggbcheck.js`;
const WASM_BINARY = `${base}wasm/ggbcheck.wasm`;

let ready: Promise<Validator> | null = null;

/** Load the validator once; repeated calls share the same promise. */
export function loadValidator(): Promise<Validator> {
  ready ??= instantiate();
  return ready;
}

/** Validate a GeoGebra script, returning a receipt with no null arrays. */
export async function validateScript(script: string): Promise<GGBReceipt> {
  const fn = await loadValidator();
  // Give a pending paint a turn before the synchronous Go call.
  await new Promise((resolve) => setTimeout(resolve, 0));
  return normalize(fn(script).receipt);
}

function injectLoader(src: string): Promise<void> {
  if (document.querySelector('script[data-ggb-loader]')) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.dataset.ggbLoader = src;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`无法加载校验器脚本：${src}`));
    document.head.appendChild(el);
  });
}

async function instantiate(): Promise<Validator> {
  await injectLoader(WASM_LOADER);
  const Go = window.Go;
  if (!Go) throw new Error('校验器脚本未注册 Go()');

  const resp = await fetch(WASM_BINARY);
  if (!resp.ok) throw new Error(`无法加载校验器：HTTP ${resp.status}`);

  const go = new Go();
  const { instance } = await WebAssembly.instantiate(await resp.arrayBuffer(), go.importObject);
  go.run(instance);

  const validate = window.ggbValidate;
  if (typeof validate !== 'function') throw new Error('校验器未注册 ggbValidate');
  window.ggbWarmup?.();

  return (script: string): GGBExport => JSON.parse(validate(script));
}

/**
 * The Go side serializes empty Go slices as `null` (Errors) or omits them, so a
 * host never has to write `rc.errors ?? []` by hand.
 */
function normalize(rc: GGBReceipt): GGBReceipt {
  return {
    ok: rc.ok === true,
    errors: rc.errors ?? [],
    warnings: rc.warnings ?? [],
    executable: rc.executable ?? [],
    kinds: rc.kinds ?? {},
    sourceIn: rc.sourceIn ?? 'text',
  };
}

/** Kinds that only exist in a 3D scene. */
const K3D = new Set(['Plane', 'Quadric', 'Solid', 'Polyhedron']);

/** A literal point written with three coordinates is a 3D point. */
const LITERAL_POINT_3D = /^\s*[A-Za-z_]\w*\s*=\s*\([^()]*,[^()]*,[^()]*\)\s*$/;

/** Pick the GeoGebra view for a validated script. */
export function perspectiveFor(receipt: GGBReceipt, commands: string[]): '1' | '2' | '5' {
  const kinds = Object.values(receipt.kinds);
  if (kinds.some((k) => K3D.has(k))) return '5';
  if (commands.some((c) => LITERAL_POINT_3D.test(c))) return '5';
  if (kinds.includes('Function') || commands.some((c) => /^[A-Za-z_]\w*\s*\(\s*x\s*\)\s*=/i.test(c))) {
    return '1';
  }
  return '2';
}

/** Render diagnostics one per line, in a form both a user and an LLM can act on. */
export function formatProblems(errors: GGBProblem[]): string {
  return errors
    .map((e) => {
      const where = e.obj ? `[${e.obj}]` : '';
      const at = e.line ? `（第${e.line}行）` : '';
      return `- [${e.code}] ${where} ${e.msg} ${at}`.replace(/\s+/g, ' ').trim();
    })
    .join('\n');
}
