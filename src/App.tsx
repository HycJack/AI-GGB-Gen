import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Upload,
  MessageSquare,
  Calculator,
  ArrowRight,
  X,
  Settings,
  Box,
  FunctionSquare,
  Triangle,
  History,
  FileText,
  Download,
  Sparkles,
} from 'lucide-react';
import GeoGebra, { type GeoGebraRef } from './components/GeoGebra';
import ScriptEditor from './components/ScriptEditor';
import SettingsModal from './components/SettingsModal';
import HistoryModal from './components/HistoryModal';
import {
  generateGeoGebraCommands,
  type ChatMessage,
  type OpenAIConfig,
  type Perspective,
  type ValidationReport,
} from './lib/gemini';
import {
  deleteSession,
  downscaleBase64,
  getApiConfig,
  getSessions,
  saveApiConfig,
  saveSession,
  updateSession,
  type SavedSession,
} from './lib/storage';
import { cn } from './lib/utils';
import { formatProblems, loadValidator } from './lib/ggbValidate';
import { useEscapeClose } from './hooks/useEscapeClose';

/** Chat-ready one-liner (or block) describing the validation outcome. */
function validationSection(v: ValidationReport): string {
  if (v.unavailable) return '**校验状态：** ⚠️ 校验器未加载，本次没有做指令校验。';
  if (v.ok) {
    return `**校验状态：** ✅ 通过（${v.attempts} 次尝试，${v.executable.length} 个对象）`;
  }
  return [
    `**校验状态：** ❌ 未通过（已尝试 ${v.attempts} 次仍有 ${v.errors.length} 处问题）`,
    '',
    formatProblems(v.errors),
  ].join('\n');
}

export default function App() {
  const [showInputModal, setShowInputModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [isProblemExpanded, setIsProblemExpanded] = useState(false);
  const [problemText, setProblemText] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [ggbCommands, setGgbCommands] = useState<string[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [perspective, setPerspective] = useState<Perspective>('2'); // Geometry by default
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SavedSession[]>([]);
  const [loadingTip, setLoadingTip] = useState('');

  // The instruction validator is a multi-megabyte wasm module, fetched only on
  // first use. Preloading it a couple of seconds after the page settles makes
  // the first generation feel instant; failures are logged and surfaced later
  // as "校验器不可用" instead of blocking the app.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadValidator().catch((error) => console.error('校验器预加载失败:', error));
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  const loadingTips = [
    '正在分析题目内容...',
    '识别几何图形特征...',
    '构建数学模型...',
    '生成 GeoGebra 指令...',
    '正在绘制图形...',
    '即将完成...',
  ];

  useEffect(() => {
    if (!isProcessing) return;
    let index = 0;
    setLoadingTip(loadingTips[0]);
    const interval = setInterval(() => {
      index = (index + 1) % loadingTips.length;
      setLoadingTip(loadingTips[index]);
    }, 10000);
    return () => clearInterval(interval);
  }, [isProcessing]);

  // Config state
  const [openAIConfig, setOpenAIConfig] = useState<OpenAIConfig>({
    apiKey: '',
    baseUrl: '',
    model: 'gemini-3-flash-preview',
  });

  const ggbRef = useRef<GeoGebraRef>(null);

  // Load sessions and API config on mount.
  useEffect(() => {
    setSessions(getSessions());
    const savedConfig = getApiConfig();
    if (savedConfig) {
      setOpenAIConfig({
        apiKey: savedConfig.apiKey,
        baseUrl: savedConfig.baseUrl,
        model: savedConfig.model,
      });
    }
  }, []);

  useEffect(() => {
    setSessions(getSessions());
  }, [showHistoryModal]);

  useEscapeClose(showInputModal && !isProcessing, () => setShowInputModal(false));

  // Auto-save the current session, debounced so the screenshot isn't taken on
  // every keystroke. Thumbnails are downscaled first — a 300dpi full-canvas PNG
  // is megabytes of localStorage quota.
  useEffect(() => {
    if (!currentSessionId || messages.length === 0) return;

    let cancelled = false;
    const save = (thumbnail?: string) => {
      updateSession(currentSessionId, {
        messages,
        ggbCommands,
        perspective,
        problemText,
        ...(thumbnail ? { thumbnail } : {}),
      });
    };

    const timer = setTimeout(() => {
      if (!ggbRef.current) {
        save();
        return;
      }
      ggbRef.current.getPNGBase64((base64) => {
        if (!base64) return;
        void downscaleBase64(base64, 'png').then((shrunk) => {
          if (!cancelled) save(`data:image/png;base64,${shrunk}`);
        });
      });
    }, 2000);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [messages, ggbCommands, perspective, problemText, currentSessionId]);

  const processImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('请上传图片文件');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert('文件大小不能超过 10MB');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => setSelectedImage(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (file) processImageFile(file);
  };

  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processImageFile(file);
  };

  const startNewSession = (
    title: string,
    problemText: string,
    commands: string[],
    messages: ChatMessage[],
    perspective: Perspective
  ) => {
    const newSession = saveSession({
      title: title.slice(0, 50),
      problemText,
      ggbCommands: commands,
      messages,
      perspective,
    });
    setCurrentSessionId(newSession.id);
    return newSession;
  };

  /** Run a batch of commands and surface a single aggregate failure, not one alert per line. */
  const runCommands = useCallback(async (commands: string[]) => {
    const applet = ggbRef.current;
    if (!applet) return;
    // Sequential on purpose: each command may depend on objects the previous
    // one just created, and a lazy-loaded module needs its retry to finish
    // before the next command runs.
    const failed: string[] = [];
    for (const cmd of commands) {
      if (!(await applet.executeCommand(cmd))) failed.push(cmd);
    }
    if (failed.length > 0) {
      const preview = failed.slice(0, 3).join('\n');
      alert(`有 ${failed.length} 条指令执行失败：\n${preview}${failed.length > 3 ? '\n…' : ''}`);
    }
  }, []);

  const loadSession = (session: SavedSession) => {
    setCurrentSessionId(session.id);
    setProblemText(session.problemText);
    setMessages(session.messages);
    setPerspective(session.perspective);
    setGgbCommands(session.ggbCommands);

    setShowHistoryModal(false);
    setShowInputModal(false);

    // Let the perspective change reach the applet before replaying the script.
    setTimeout(() => {
      const applet = ggbRef.current;
      if (!applet) return;
      applet.reset();
      applet.setPerspective(session.perspective);
      runCommands(session.ggbCommands);
    }, 100);
  };

  const handleDeleteSession = (id: string) => {
    deleteSession(id);
    setSessions(getSessions());
    if (currentSessionId === id) {
      setCurrentSessionId(null);
      setMessages([]);
      setGgbCommands([]);
      setProblemText('');
      setShowInputModal(true);
    }
  };

  const handleInitialSubmit = async () => {
    if (!problemText.trim() && !selectedImage) return;

    if (!openAIConfig.apiKey) {
      alert('请先在设置中配置 API Key');
      setShowSettingsModal(true);
      return;
    }

    setIsProcessing(true);
    try {
      let base64Data: string | undefined;
      let mimeType: string | undefined;
      if (selectedImage) {
        const [prefix, ...rest] = selectedImage.split(',');
        base64Data = rest.join(',');
        mimeType = prefix.match(/:(.*?);/)?.[1];
      }

      const { commands, perspective: newPerspective, validation } =
        await generateGeoGebraCommands(problemText, base64Data, mimeType, openAIConfig);

      if (commands.length === 0) {
        throw new Error('模型没有返回任何可用的 GeoGebra 指令');
      }

      // The model is asked for instructions only, so the user's own wording is
      // the only description we have.
      const displayText = problemText.trim() || '（图片题目）';

      setGgbCommands(commands);
      setPerspective(newPerspective);
      setProblemText(displayText);

      const applet = ggbRef.current;
      if (applet) {
        applet.reset();
        applet.setPerspective(newPerspective);
      }
      runCommands(commands);

      const initialContent = [
        '我已经根据你的题目设置好了 GeoGebra 画板。',
        '',
        '**题目描述：**',
        displayText,
        '',
        validationSection(validation),
        '',
        '**GeoGebra 指令：**',
        '```geogebra',
        commands.join('\n'),
        '```',
        '',
        validation.ok
          ? '你可以自由探索图形，或者让我一步步为你讲解解题思路！'
          : '以上指令未通过校验器检查，画板里可能只画出了部分图形。可以到右侧脚本编辑器修改后重试。',
      ].join('\n');

      const initialMessages: ChatMessage[] = [{ role: 'assistant', content: initialContent }];
      setMessages(initialMessages);

      startNewSession(displayText, displayText, commands, initialMessages, newPerspective);
      setShowInputModal(false);
    } catch (error) {
      console.error('Failed to process problem:', error);
      alert(
        '处理题目失败，请检查 API 设置后重试。\n' +
          (error instanceof Error ? error.message : String(error))
      );
    } finally {
      setIsProcessing(false);
    }
  };

  // The ScriptEditor saves through these; useCallback keeps their identity stable
  // across unrelated re-renders (chat width, loading tips, ...).
  const handleScriptSave = useCallback(
    (commands: string[]) => {
      setGgbCommands(commands);
      if (currentSessionId) {
        updateSession(currentSessionId, {
          messages,
          ggbCommands: commands,
          perspective,
          problemText,
        });
      }
    },
    [currentSessionId, messages, perspective, problemText]
  );

  const handleScriptExecute = useCallback(
    (commands: string[]) => runCommands(commands),
    [runCommands]
  );

  const handleScriptReset = useCallback(() => {
    ggbRef.current?.reset();
  }, []);

  const [chatWidth, setChatWidth] = useState(400);
  const isResizingRef = useRef(false);

  const startResizing = () => {
    isResizingRef.current = true;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', stopResizing);
    document.body.classList.add('select-none');
  };

  const stopResizing = () => {
    isResizingRef.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', stopResizing);
    document.body.classList.remove('select-none');
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isResizingRef.current) return;
    const newWidth = window.innerWidth - e.clientX;
    if (newWidth > 300 && newWidth < window.innerWidth * 0.6) {
      setChatWidth(newWidth);
    }
  };

  // line-clamp-3 cuts off by rendered lines, so a long single paragraph with no
  // newlines would be hidden with no way to expand. Measure instead.
  const problemRef = useRef<HTMLParagraphElement>(null);
  const [problemClamped, setProblemClamped] = useState(false);

  useEffect(() => {
    const el = problemRef.current;
    setProblemClamped(el ? el.scrollHeight > el.clientHeight + 1 : false);
  }, [problemText, isProblemExpanded]);

  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-2.5 flex items-center justify-between shadow-sm z-10 shrink-0">
        <div className="flex items-center gap-2">
          <div className="bg-blue-600 p-1.5 rounded-lg">
            <Calculator className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-lg font-bold text-gray-900">GeoGebra AI Tutor</h1>
        </div>

        {/* Perspective Switcher */}
        <div className="flex bg-gray-100 p-0.5 rounded-lg">
          <button
            onClick={() => setPerspective('1')}
            className={cn(
              'px-2 py-1 rounded-md transition-all flex items-center gap-1.5 text-xs font-medium',
              perspective === '1' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            )}
            title="函数/代数 (Algebra & Graphics)"
            aria-pressed={perspective === '1'}
          >
            <FunctionSquare className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">函数</span>
          </button>
          <button
            onClick={() => setPerspective('2')}
            className={cn(
              'px-2 py-1 rounded-md transition-all flex items-center gap-1.5 text-xs font-medium',
              perspective === '2' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            )}
            title="平面几何 (Geometry)"
            aria-pressed={perspective === '2'}
          >
            <Triangle className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">平面</span>
          </button>
          <button
            onClick={() => setPerspective('5')}
            className={cn(
              'px-2 py-1 rounded-md transition-all flex items-center gap-1.5 text-xs font-medium',
              perspective === '5' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            )}
            title="立体几何 (3D Graphics)"
            aria-pressed={perspective === '5'}
          >
            <Box className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">立体</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowInputModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <Calculator className="w-3.5 h-3.5" />
            新题目
          </button>

          <button
            onClick={() => setShowHistoryModal(true)}
            className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
            title="历史记录"
            aria-label="历史记录"
          >
            <History className="w-4 h-4" />
          </button>

          <button
            onClick={() => ggbRef.current?.downloadGGB()}
            className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
            title="下载 .ggb 文件"
            aria-label="下载 GeoGebra 文件"
          >
            <Download className="w-4 h-4" />
          </button>

          <button
            onClick={() => setShowSettingsModal(true)}
            className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
            title="模型配置"
            aria-label="模型配置"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden min-h-0">
        {/* Left: GeoGebra Board */}
        <div className="flex-1 bg-white p-4 overflow-hidden relative flex flex-col gap-4">
          {/* Problem Description Area */}
          {problemText && (
            <div
              className={cn(
                'bg-white rounded-xl border border-gray-200 shadow-sm p-3 shrink-0 transition-all duration-300',
                isProblemExpanded ? 'max-h-[500px]' : 'max-h-[100px]'
              )}
            >
              <div className="flex items-center gap-2 mb-2 text-gray-900 font-medium">
                <FileText className="w-4 h-4 text-blue-600" />
                <span>题目描述</span>
              </div>
              <div className="relative">
                <p
                  ref={problemRef}
                  className={cn(
                    'text-sm text-gray-600 whitespace-pre-wrap transition-all duration-300',
                    isProblemExpanded ? '' : 'line-clamp-3'
                  )}
                >
                  {problemText}
                </p>
                {!isProblemExpanded && problemClamped && (
                  <button
                    onClick={() => setIsProblemExpanded(true)}
                    className="absolute bottom-0 right-0 text-xs text-blue-600 hover:text-blue-700 font-medium bg-gradient-to-l from-transparent via-white to-white pl-4 py-1 transition-colors"
                  >
                    展开全部
                  </button>
                )}
                {isProblemExpanded && (
                  <button
                    onClick={() => setIsProblemExpanded(false)}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium mt-2 transition-colors"
                  >
                    收起
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="flex-1 w-full rounded-xl overflow-hidden shadow-inner border border-gray-200 bg-gray-100 min-h-0">
            <GeoGebra
              ref={ggbRef}
              initialCommands={ggbCommands}
              perspective={perspective}
            />
          </div>
        </div>

        {/* Right: Script Editor */}
        <div
          className="bg-white border-l border-gray-200 flex flex-col shadow-xl z-20 h-full relative"
          style={{ width: chatWidth }}
        >
          {/* Resize Handle */}
          <div
            className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 transition-colors z-30 flex items-center justify-center group"
            onMouseDown={startResizing}
            role="separator"
            aria-label="调整脚本编辑器宽度"
          >
            <div className="w-1 h-8 bg-gray-300 rounded-full group-hover:bg-blue-500 transition-colors" />
          </div>

          <div className="flex-1 overflow-hidden min-h-0">
            <ScriptEditor
              initialCode={ggbCommands}
              onSave={handleScriptSave}
              geminiConfig={openAIConfig}
              onExecute={handleScriptExecute}
              onReset={handleScriptReset}
              className="h-full border-none shadow-none rounded-none"
            />
          </div>
        </div>
      </main>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        apiKey={openAIConfig.apiKey}
        baseUrl={openAIConfig.baseUrl || ''}
        model={openAIConfig.model}
        onSave={(apiKey, baseUrl, model) => {
          setOpenAIConfig({ apiKey, baseUrl, model });
          saveApiConfig({ apiKey, baseUrl, model });
        }}
      />

      {/* History Modal */}
      <HistoryModal
        isOpen={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        sessions={sessions}
        onSelectSession={loadSession}
        onDeleteSession={handleDeleteSession}
      />

      {/* Input Modal */}
      {showInputModal && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowInputModal(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="开始新题目"
            className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden relative"
            onClick={(e) => e.stopPropagation()}
          >
            {isProcessing && (
              <div className="absolute inset-0 z-10 bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center p-8 text-center">
                <div className="relative w-24 h-24 mb-8">
                  <div className="absolute inset-0 border-4 border-blue-100 rounded-full"></div>
                  <div className="absolute inset-0 border-4 border-blue-600 rounded-full border-t-transparent animate-spin"></div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Sparkles className="w-8 h-8 text-blue-600 animate-pulse" />
                  </div>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">AI 正在思考</h3>
                <p className="text-blue-600 font-medium animate-pulse">{loadingTip}</p>
                <p className="text-gray-400 text-sm mt-8">这通常需要 10-20 秒，请耐心等待</p>
              </div>
            )}

            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
              <h2 className="text-xl font-bold text-gray-900">开始新题目</h2>
              <button onClick={() => setShowInputModal(false)} className="text-gray-400 hover:text-gray-600" aria-label="关闭">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-6 flex-1 overflow-y-auto">
              {/* Image Upload - Primary */}
              <div>
                <label className="block text-base font-semibold text-gray-900 mb-2 flex items-center gap-2">
                  <div className="p-1.5 bg-blue-100 rounded-lg text-blue-600">
                    <Upload className="w-4 h-4" />
                  </div>
                  上传题目图片 (推荐)
                </label>
                <div
                  className={cn(
                    'mt-1 flex justify-center px-6 pt-8 pb-8 border-2 border-dashed rounded-2xl transition-all cursor-pointer relative group bg-gray-50/30',
                    isDragging
                      ? 'border-blue-500 bg-blue-100/50 scale-[1.02]'
                      : 'border-blue-100 hover:bg-blue-50/50 hover:border-blue-300'
                  )}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <div className="space-y-2 text-center w-full">
                    {selectedImage ? (
                      <div className="relative inline-block">
                        <img src={selectedImage} alt="题目图片预览" className="mx-auto h-48 object-contain rounded-lg shadow-md" />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedImage(null);
                          }}
                          className="absolute -top-3 -right-3 bg-white text-red-500 rounded-full p-1.5 hover:bg-red-50 shadow-lg border border-gray-100 transition-transform hover:scale-110"
                          aria-label="移除图片"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center w-full h-full">
                        <div
                          className={cn(
                            'w-16 h-16 rounded-full flex items-center justify-center mb-4 transition-transform',
                            isDragging ? 'bg-blue-500 scale-110' : 'bg-blue-100 group-hover:scale-110'
                          )}
                        >
                          <Upload className={cn('h-8 w-8', isDragging ? 'text-white' : 'text-blue-600')} />
                        </div>
                        <div className="text-lg font-medium text-gray-900">
                          {isDragging ? '松开以上传图片' : '点击上传图片'}
                        </div>
                        <p className="text-sm text-gray-500 mt-1">或将图片拖拽至此处</p>
                        <p className="text-xs text-gray-400 mt-4">支持 PNG, JPG, GIF (最大 10MB)</p>
                        <input id="file-upload" name="file-upload" type="file" className="sr-only" accept="image/*" onChange={handleImageUpload} />
                      </label>
                    )}
                  </div>
                </div>
              </div>

              {/* Text Input - Secondary */}
              <div>
                <label htmlFor="problem-text" className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                  <div className="p-1.5 bg-gray-100 rounded-lg text-gray-600">
                    <MessageSquare className="w-3 h-3" />
                  </div>
                  补充描述 (可选)
                </label>
                <textarea
                  id="problem-text"
                  value={problemText}
                  onChange={(e) => setProblemText(e.target.value)}
                  placeholder="如果图片不清晰，可以在这里补充题目条件..."
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 min-h-[80px] resize-none text-sm bg-gray-50 focus:bg-white transition-colors"
                />
              </div>
            </div>

            <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-end shrink-0">
              <button
                onClick={handleInitialSubmit}
                disabled={(!problemText.trim() && !selectedImage) || isProcessing}
                className="flex items-center gap-2 px-8 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-all shadow-lg hover:shadow-xl active:scale-95 text-lg"
              >
                开始解题
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
