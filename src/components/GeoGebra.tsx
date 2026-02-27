import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';

declare global {
  interface Window {
    GGBApplet: any;
    ggbApplet: any;
  }
}

interface GeoGebraProps {
  initialCommands?: string[];
  onUpdate?: (objectName: string) => void;
  onAdd?: (objectName: string) => void;
  onRemove?: (objectName: string) => void;
  perspective?: string; // "1" for Algebra & Graphics, "2" for Geometry, "5" for 3D Graphics
}

export interface GeoGebraRef {
  executeCommand: (cmd: string) => void;
  getCommandString: (objName?: string) => string | string[];
  getAllObjectNames: () => string[];
  getObjectNumber: () => number;
  getObjectName: (i: number) => string;
  getValueString: (objName: string) => string;
  evalCommand: (cmd: string) => void;
  setSize: (width: number, height: number) => void;
  setPerspective: (perspective: string) => void;
  reset: () => void;
  downloadGGB: () => void;
  getPNGBase64: (callback: (data: string) => void) => void;
}

const GeoGebra = forwardRef<GeoGebraRef, GeoGebraProps>(({ 
  initialCommands = [], 
  onUpdate,
  onAdd,
  onRemove,
  perspective = "2" // Default to Geometry
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const appletRef = useRef<any>(null);
  const [isReady, setIsReady] = useState(false);
  
  // Generate a unique ID for the applet container to avoid React reconciliation issues
  const appletId = useRef(`ggb-applet-${Math.random().toString(36).substr(2, 9)}`);

  useImperativeHandle(ref, () => ({
    executeCommand: (cmd: string) => {
      if (appletRef.current) {
        appletRef.current.evalCommand(cmd);
      }
    },
    getCommandString: (objName?: string) => {
      if (!appletRef.current) return [];
      if (objName) return appletRef.current.getCommandString(objName);
      
      const names = appletRef.current.getAllObjectNames();
      const commands = [];
      for (const name of names) {
        const cmd = appletRef.current.getCommandString(name);
        if (cmd) {
          commands.push(`${name} = ${cmd}`);
        } else {
           // For free objects or points, get value string or definition
           const val = appletRef.current.getValueString(name);
           commands.push(val);
        }
      }
      return commands;
    },
    getAllObjectNames: () => {
      return appletRef.current ? appletRef.current.getAllObjectNames() : [];
    },
    getObjectNumber: () => appletRef.current?.getObjectNumber() || 0,
    getObjectName: (i: number) => appletRef.current?.getObjectName(i) || "",
    getValueString: (objName: string) => appletRef.current?.getValueString(objName) || "",
    evalCommand: (cmd: string) => appletRef.current?.evalCommand(cmd),
    setSize: (width: number, height: number) => {
      if (appletRef.current) {
        appletRef.current.setSize(width, height);
      }
    },
    setPerspective: (p: string) => {
      if (appletRef.current) {
        appletRef.current.setPerspective(p);
      }
    },
    reset: () => {
      if (appletRef.current) {
        appletRef.current.reset();
      }
    },
    downloadGGB: () => {
      if (appletRef.current) {
        // getBase64(callback) returns the .ggb file as base64 string
        // Note: The documentation says getBase64() returns the .ggb file, 
        // while getPNGBase64() returns the PNG image.
        appletRef.current.getBase64((base64: string) => {
          const link = document.createElement('a');
          link.href = 'data:application/vnd.geogebra.file;base64,' + base64;
          link.download = `geogebra-export-${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.ggb`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        });
      }
    },
    getPNGBase64: (callback: (data: string) => void) => {
      if (appletRef.current) {
        // getPNGBase64(exportScale, transparent, dpi, copyToClipboard, callback)
        // We use a scale of 1, transparent false, default dpi, false for clipboard
        appletRef.current.getPNGBase64(1, false, 300, false, callback);
      }
    }
  }));

  useEffect(() => {
    // If applet is already ready, just update perspective
    if (isReady && appletRef.current) {
      appletRef.current.setPerspective(perspective);
      return;
    }

    const loadGeoGebra = () => {
      if (window.GGBApplet) {
        initApplet();
      } else {
        const script = document.createElement('script');
        script.src = 'https://www.geogebra.org/apps/deployggb.js';
        script.onload = () => initApplet();
        document.body.appendChild(script);
      }
    };

    const initApplet = () => {
      if (!containerRef.current) return;
      
      // Check if already injected
      const appletDiv = document.getElementById(appletId.current);
      if (!appletDiv || appletDiv.getAttribute("data-injected") === "yes") return;

      const params = {
        "appName": "classic", // Use classic to support all perspectives
        "width": containerRef.current.clientWidth,
        "height": containerRef.current.clientHeight,
        "showToolBar": true,
        "showAlgebraInput": true,
        "showMenuBar": false,
        "perspective": perspective,
        "allowStyleBar": true,
        "showResetIcon": true,
        "enableLabelDrags": false,
        "enableShiftDragZoom": true,
        "enableRightClick": true,
        "capturingThreshold": null,
        "showLogging": false,
        "useBrowserForJS": false,
        "appletOnLoad": (api: any) => {
          appletRef.current = api;
          setIsReady(true);
          
          // Register listeners
          if (onUpdate) api.registerUpdateListener(onUpdate);
          if (onAdd) api.registerAddListener(onAdd);
          if (onRemove) api.registerRemoveListener(onRemove);

          // Execute initial commands
          if (initialCommands.length > 0) {
            initialCommands.forEach(cmd => api.evalCommand(cmd));
          }
        }
      };

      appletDiv.setAttribute("data-injected", "yes");
      // @ts-ignore
      const applet = new window.GGBApplet(params, true);
      applet.inject(appletId.current);
    };

    loadGeoGebra();

  }, []); // Only run once on mount to load script

  // Handle perspective changes
  useEffect(() => {
    if (isReady && appletRef.current) {
      appletRef.current.setPerspective(perspective);
    }
  }, [perspective, isReady]);

  // Handle resize using ResizeObserver on the container
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      if (!appletRef.current) return;

      for (const entry of entries) {
        // Try to use contentBoxSize for more precise sub-pixel values if available
        let width, height;
        if (entry.contentBoxSize) {
          // contentBoxSize is an array
          const contentBox = Array.isArray(entry.contentBoxSize) ? entry.contentBoxSize[0] : entry.contentBoxSize;
          width = contentBox.inlineSize;
          height = contentBox.blockSize;
        } else {
          // Fallback to contentRect
          width = entry.contentRect.width;
          height = entry.contentRect.height;
        }
        
        if (width > 0 && height > 0) {
          appletRef.current.setSize(width, height);
        }
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [isReady]); // Re-bind if isReady changes (though appletRef is stable)

  // Handle initial commands - only on mount/ready
  useEffect(() => {
    if (isReady && appletRef.current && initialCommands.length > 0) {
      // Only execute if we haven't executed these specific commands yet?
      // Or just run once when ready.
      // We'll rely on parent to call executeCommand for updates.
      appletRef.current.reset();
      initialCommands.forEach(cmd => appletRef.current.evalCommand(cmd));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady]); // Only run when applet becomes ready, not when commands change later

  return (
    <div 
      ref={containerRef} 
      className="w-full h-full border border-gray-200 rounded-lg overflow-hidden shadow-sm bg-white relative"
    >
      <div id={appletId.current} className="w-full h-full" />
    </div>
  );
});

GeoGebra.displayName = 'GeoGebra';

export default GeoGebra;
