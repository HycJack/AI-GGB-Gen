import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, Save, RotateCcw, FileText, Wand2, X, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { OpenAIConfig, modifyGeoGebraCommands } from '../lib/gemini';

interface ScriptEditorProps {
  initialCode: string[];
  onSave: (code: string[]) => void;
  onExecute: (commands: string[]) => void;
  onReset: () => void;
  className?: string;
  geminiConfig?: OpenAIConfig;
}

export default function ScriptEditor({ 
  initialCode, 
  onSave, 
  onExecute, 
  onReset,
  className,
  geminiConfig
}: ScriptEditorProps) {
  const [code, setCode] = useState(initialCode.join('\n'));
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentLine, setCurrentLine] = useState(-1);
  const [isDirty, setIsDirty] = useState(false);
  
  // AI Modification State
  const [selectionRange, setSelectionRange] = useState<{start: number, end: number} | null>(null);
  const [showAiInput, setShowAiInput] = useState(false);
  const [aiInstruction, setAiInstruction] = useState('');
  const [isAiProcessing, setIsAiProcessing] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const executionTimerRef = useRef<NodeJS.Timeout | null>(null);

  const lastSavedCodeRef = useRef(initialCode.join('\n'));

  // Sync with external changes (e.g. AI generation or loaded session)
  useEffect(() => {
    const newCode = initialCode.join('\n');
    if (newCode !== lastSavedCodeRef.current) {
      setCode(newCode);
      lastSavedCodeRef.current = newCode;
      setIsDirty(false);
    }
  }, [initialCode]);

  // Debounced Save
  useEffect(() => {
    const timer = setTimeout(() => {
      if (isDirty) {
        const commands = code.split('\n').filter(line => line.trim() !== '');
        onSave(commands);
        lastSavedCodeRef.current = commands.join('\n'); // Mark this version as "ours"
        setIsDirty(false);
      }
    }, 1000); // 1 second debounce

    return () => clearTimeout(timer);
  }, [code, isDirty, onSave]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setCode(e.target.value);
    setIsDirty(true);
  };

  const handleSelect = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget;
    if (target.selectionStart !== target.selectionEnd) {
      setSelectionRange({ start: target.selectionStart, end: target.selectionEnd });
    } else {
      setSelectionRange(null);
      if (!showAiInput) {
        // Only hide if we aren't already typing in the AI box
        // Actually, we might want to keep the box open if the user is just clicking around?
        // But usually clicking away clears selection.
        // Let's keep it simple: clear selection = hide button (but maybe keep modal if open?)
      }
    }
  };

  const handleScroll = () => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const stopExecution = useCallback(() => {
    if (executionTimerRef.current) {
      clearTimeout(executionTimerRef.current);
      executionTimerRef.current = null;
    }
    setIsPlaying(false);
    setCurrentLine(-1);
  }, []);

  const runScript = useCallback(() => {
    if (isPlaying) {
      stopExecution();
      return;
    }

    setIsPlaying(true);
    onReset(); 
    
    const lines = code.split('\n').filter(line => line.trim() !== '');
    let index = 0;

    const executeNext = () => {
      if (index >= lines.length) {
        stopExecution();
        return;
      }

      setCurrentLine(index);
      const cmd = lines[index];
      onExecute([cmd]); 

      index++;
      executionTimerRef.current = setTimeout(executeNext, 800); 
    };

    executeNext();
  }, [code, isPlaying, onReset, onExecute, stopExecution]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (executionTimerRef.current) {
        clearTimeout(executionTimerRef.current);
      }
    };
  }, []);

  const handleAiModify = async () => {
    if (!selectionRange || !geminiConfig || !aiInstruction.trim()) return;

    setIsAiProcessing(true);
    try {
      const selectedText = code.substring(selectionRange.start, selectionRange.end);
      const fullScript = code.split('\n');
      
      const newCommands = await modifyGeoGebraCommands(
        fullScript,
        selectedText,
        aiInstruction,
        geminiConfig
      );

      const newText = newCommands.join('\n');
      
      // Replace text
      const before = code.substring(0, selectionRange.start);
      const after = code.substring(selectionRange.end);
      const updatedCode = before + newText + after;
      
      setCode(updatedCode);
      
      // Immediately save the updated code
      const commands = updatedCode.split('\n').filter(line => line.trim() !== '');
      onSave(commands);
      lastSavedCodeRef.current = updatedCode;
      setIsDirty(false);
      
      setShowAiInput(false);
      setAiInstruction('');
      setSelectionRange(null);
      
    } catch (error) {
      alert("AI 修改失败，请重试");
    } finally {
      setIsAiProcessing(false);
    }
  };

  return (
    <div className={cn("flex flex-col h-full bg-white border-l border-gray-200 shadow-xl relative", className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-gray-500" />
          <h2 className="font-semibold text-gray-700">GGB 脚本</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={runScript}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              isPlaying 
                ? "bg-amber-100 text-amber-700 hover:bg-amber-200" 
                : "bg-green-100 text-green-700 hover:bg-green-200"
            )}
          >
            {isPlaying ? (
              <>
                <Pause className="w-4 h-4" />
                暂停
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                执行
              </>
            )}
          </button>
          <button
            onClick={() => {
              onReset();
              const lines = code.split('\n').filter(line => line.trim() !== '');
              onExecute(lines);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
            title="批量执行所有指令"
          >
            <Play className="w-4 h-4" />
            批量执行
          </button>
          <button
            onClick={() => {
              stopExecution();
              onReset();
            }}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-md transition-colors"
            title="重置画板"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* AI Modification Bar */}
      {showAiInput && (
        <div className="absolute top-[60px] left-4 right-4 z-20 bg-white border border-blue-200 shadow-lg rounded-lg p-3 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2 mb-2">
            <Wand2 className="w-4 h-4 text-purple-600" />
            <span className="text-sm font-medium text-gray-700">AI 修改选中指令</span>
            <button 
              onClick={() => setShowAiInput(false)}
              className="ml-auto text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={aiInstruction}
              onChange={(e) => setAiInstruction(e.target.value)}
              placeholder="例如：把这个三角形改成等边三角形..."
              className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
              onKeyDown={(e) => e.key === 'Enter' && handleAiModify()}
              autoFocus
            />
            <button
              onClick={handleAiModify}
              disabled={isAiProcessing || !aiInstruction.trim()}
              className="px-3 py-1.5 bg-purple-600 text-white text-sm font-medium rounded-md hover:bg-purple-700 disabled:opacity-50 flex items-center gap-1"
            >
              {isAiProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : '修改'}
            </button>
          </div>
        </div>
      )}

      {/* Editor Area */}
      <div className="flex-1 relative group">
        <div className="absolute inset-0 flex">
          {/* Line Numbers */}
          <div 
            ref={lineNumbersRef}
            className="w-12 bg-gray-50 border-r border-gray-200 pt-4 text-right pr-2 text-gray-400 font-mono text-sm select-none overflow-hidden"
          >
            {code.split('\n').map((_, i) => (
              <div key={i} className={cn(
                "leading-6",
                currentLine === i && "text-blue-600 font-bold bg-blue-50"
              )}>
                {i + 1}
              </div>
            ))}
          </div>
          
          {/* Text Area */}
          <textarea
            ref={textareaRef}
            value={code}
            onChange={handleChange}
            onSelect={handleSelect}
            onScroll={handleScroll}
            className="flex-1 p-4 font-mono text-sm bg-white border-none focus:ring-0 resize-none outline-none text-gray-800 leading-6 whitespace-pre overflow-auto selection:bg-purple-100 selection:text-purple-900"
            spellCheck={false}
            placeholder="输入 GeoGebra 指令，每行一条..."
          />
        </div>

        {/* Floating AI Button */}
        {selectionRange && !showAiInput && (
          <button
            onClick={() => setShowAiInput(true)}
            className="absolute top-4 right-8 bg-white text-purple-600 border border-purple-200 shadow-md px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 hover:bg-purple-50 transition-all animate-in fade-in zoom-in duration-200 z-10"
          >
            <Wand2 className="w-3 h-3" />
            AI 修改
          </button>
        )}
      </div>

      {/* Status Bar */}
      <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-500 flex justify-between items-center shrink-0">
        <span>{code.split('\n').length} 行指令</span>
        <span className={cn("flex items-center gap-1.5", isDirty ? "text-amber-600" : "text-green-600")}>
          <Save className="w-3 h-3" />
          {isDirty ? "编辑中..." : "已保存"}
        </span>
      </div>
    </div>
  );
}
