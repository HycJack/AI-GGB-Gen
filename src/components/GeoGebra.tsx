import { useCallback, useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { Perspective } from '../lib/gemini';

declare global {
  interface Window {
    GGBApplet: any;
    ggbApplet: any;
  }
}

/**
 * Discrete-mathematics commands are lazy-loaded by the web3d applet through
 * GWT.runAsync. The first synchronous evalCommand() call throws a
 * "command not loaded" error, and that failed call is what triggers the load —
 * so the fix is to retry, not to avoid the command. Waiting these gaps between
 * attempts costs a few hundred ms only for the commands that actually need it.
 */
const LAZY_LOAD_RETRIES = [400, 900, 1500];

function isLazyLoadError(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /not\s*loaded|commandnotloaded|runasync|not\s*yet/i.test(text);
}

interface GeoGebraProps {
  initialCommands?: string[];
  onUpdate?: (objectName: string) => void;
  onAdd?: (objectName: string) => void;
  onRemove?: (objectName: string) => void;
  perspective?: Perspective; // "1" Algebra & Graphics, "2" Geometry, "5" 3D Graphics
}

export interface GeoGebraRef {
  /**
   * Returns false instead of throwing when the applet is not ready or the
   * command fails. A command whose module is still lazy-loading is retried
   * before giving up, so this only rejects once the module has arrived.
   */
  executeCommand: (cmd: string) => Promise<boolean>;
  evalCommand: (cmd: string) => Promise<boolean>;
  getAllObjectNames: () => string[];
  setPerspective: (perspective: Perspective) => void;
  reset: () => void;
  downloadGGB: () => void;
  getPNGBase64: (callback: (data: string) => void) => void;
  deleteObject: (objName: string) => void;
}

const GEOGEBRA_SCRIPT_URL = 'https://www.geogebra.org/apps/deployggb.js';
const SCRIPT_TIMEOUT_MS = 20_000;

const GeoGebra = forwardRef<GeoGebraRef, GeoGebraProps>(
  (
    {
      initialCommands = [],
      onUpdate,
      onAdd,
      onRemove,
      perspective = '2',
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const appletRef = useRef<any>(null);
    const [isReady, setIsReady] = useState(false);
    const [scriptError, setScriptError] = useState<string | null>(null);

    // Stable unique id so React reconciliation never re-creates the applet div.
    const appletId = useRef(`ggb-applet-${Math.random().toString(36).slice(2, 11)}`);

    const runCommand = useCallback(async (cmd: string): Promise<boolean> => {
      const applet = appletRef.current;
      if (!applet) return false;
      try {
        applet.evalCommand(cmd);
        return true;
      } catch (error) {
        if (!isLazyLoadError(error)) {
          console.error('GeoGebra command execution error:', cmd, error);
          return false;
        }
        // The first call failed only because the module had not arrived yet.
        for (const delay of LAZY_LOAD_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, delay));
          try {
            applet.evalCommand(cmd);
            return true;
          } catch (error2) {
            if (!isLazyLoadError(error2)) {
              console.error('GeoGebra command execution error:', cmd, error2);
              return false;
            }
          }
        }
        console.error('GeoGebra lazy-loaded command never became available:', cmd, error);
        return false;
      }
    }, []);

    const reset = useCallback(() => {
      if (!appletRef.current) return;
      const applet = appletRef.current;

      try {
        const objNames = applet.getAllObjectNames();
        objNames.forEach((name: string) => {
          try {
            applet.deleteObject(name);
          } catch {
            // Some objects (e.g. locked or system objects) cannot be deleted.
          }
        });
      } catch (error) {
        console.error('GeoGebra reset error:', error);
      }

      applet.reset();
      // Reset can revert view settings; re-apply the 3D perspective afterwards.
      if (perspective === '5') applet.setPerspective(perspective);
    }, [perspective]);

    useImperativeHandle(
      ref,
      () => ({
        executeCommand: runCommand,
        evalCommand: runCommand,
        getAllObjectNames: () => appletRef.current?.getAllObjectNames() ?? [],
        setPerspective: (p: Perspective) => {
          if (appletRef.current) appletRef.current.setPerspective(p);
        },
        reset,
        downloadGGB: () => {
          if (!appletRef.current) return;
          // getBase64() returns the .ggb file; getPNGBase64() returns the PNG image.
          appletRef.current.getBase64((base64: string) => {
            const link = document.createElement('a');
            link.href = `data:application/vnd.geogebra.file;base64,${base64}`;
            link.download = `geogebra-export-${new Date()
              .toISOString()
              .slice(0, 19)
              .replace(/:/g, '-')}.ggb`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          });
        },
        getPNGBase64: (callback: (data: string) => void) => {
          if (!appletRef.current) return;
          appletRef.current.getPNGBase64(1, false, 300, false, callback);
        },
        deleteObject: (objName: string) => {
          if (!appletRef.current) return;
          try {
            appletRef.current.deleteObject(objName);
          } catch (error) {
            console.error('GeoGebra deleteObject error:', objName, error);
          }
        },
      }),
      [runCommand, reset]
    );

    useEffect(() => {
      let scriptLoading = false;

      const initApplet = () => {
        if (!containerRef.current) return;
        // Guard against double injection (e.g. StrictMode effect re-run).
        if (document.getElementById(appletId.current)?.getAttribute('data-injected') === 'yes') {
          return;
        }

        const params = {
          appName: 'classic', // classic supports all perspectives
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
          showToolBar: true,
          showAlgebraInput: false,
          showMenuBar: false,
          perspective,
          allowStyleBar: false,
          showResetIcon: true,
          enableLabelDrags: false,
          enableShiftDragZoom: true,
          enableRightClick: true,
          capturingThreshold: null,
          showLogging: false,
          useBrowserForJS: false,
          appletOnLoad: (api: any) => {
            appletRef.current = api;
            setScriptError(null);

            if (onUpdate) api.registerUpdateListener(onUpdate);
            if (onAdd) api.registerAddListener(onAdd);
            if (onRemove) api.registerRemoveListener(onRemove);

            // Give the applet a moment to fully initialize before running commands.
            setTimeout(() => {
              setIsReady(true);
              initialCommands.forEach((cmd) => runCommand(cmd));
            }, 100);
          },
        };

        document.getElementById(appletId.current)?.setAttribute('data-injected', 'yes');
        // @ts-ignore - GGBApplet is injected by deployggb.js at runtime
        const applet = new window.GGBApplet(params, true);
        applet.inject(appletId.current);
      };

      const loadGeoGebra = () => {
        if (window.GGBApplet) {
          initApplet();
          return;
        }
        if (scriptLoading) return;
        scriptLoading = true;

        const script = document.createElement('script');
        script.src = GEOGEBRA_SCRIPT_URL;
        script.onload = () => {
          scriptLoading = false;
          initApplet();
        };
        script.onerror = () => {
          scriptLoading = false;
          setScriptError('GeoGebra 脚本加载失败，请检查网络连接后重试');
        };
        document.body.appendChild(script);
      };

      const timeoutId = setTimeout(() => {
        if (!appletRef.current) {
          setScriptError('GeoGebra 加载超时，请检查网络连接后重试');
        }
      }, SCRIPT_TIMEOUT_MS);

      loadGeoGebra();

      return () => clearTimeout(timeoutId);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Load the script and the applet exactly once.

    // Handle perspective changes after the applet is ready.
    useEffect(() => {
      if (isReady && appletRef.current) {
        appletRef.current.setPerspective(perspective);
      }
    }, [perspective, isReady]);

    // Resize the applet to match its container.
    useEffect(() => {
      if (!containerRef.current) return;

      const resizeObserver = new ResizeObserver((entries) => {
        if (!appletRef.current) return;
        for (const entry of entries) {
          let width: number;
          let height: number;
          if (entry.contentBoxSize) {
            const box = Array.isArray(entry.contentBoxSize)
              ? entry.contentBoxSize[0]
              : entry.contentBoxSize;
            width = box.inlineSize;
            height = box.blockSize;
          } else {
            width = entry.contentRect.width;
            height = entry.contentRect.height;
          }
          if (width > 0 && height > 0) {
            appletRef.current.setSize(width, height);
          }
        }
      });

      resizeObserver.observe(containerRef.current);
      return () => resizeObserver.disconnect();
    }, [isReady]);

    return (
      <div
        ref={containerRef}
        className="w-full h-full border border-gray-200 rounded-lg overflow-hidden shadow-sm bg-white relative"
      >
        <div id={appletId.current} className="w-full h-full" />
        {scriptError && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white text-center px-6">
            <AlertTriangle className="w-9 h-9 text-red-400" />
            <p className="text-sm text-gray-500">{scriptError}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              刷新重试
            </button>
          </div>
        )}
      </div>
    );
  }
);

GeoGebra.displayName = 'GeoGebra';

export default GeoGebra;
