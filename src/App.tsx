import { useState, useRef, useEffect } from 'react';
import { Upload, MessageSquare, Calculator, ArrowRight, Loader2, X, Settings, Box, FunctionSquare, Triangle, History, FileText, LogOut, User as UserIcon, Download, Sparkles } from 'lucide-react';
import GeoGebra, { GeoGebraRef } from './components/GeoGebra';
import ScriptEditor from './components/ScriptEditor';
import SettingsModal from './components/SettingsModal';
import HistoryModal from './components/HistoryModal';
import { generateGeoGebraCommands, ChatMessage, OpenAIConfig } from './lib/gemini';
import { saveSession, updateSession, getSessions, deleteSession, SavedSession } from './lib/storage';
import { cn } from './lib/utils';

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
  const [perspective, setPerspective] = useState("2"); // Default to Geometry (2)
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SavedSession[]>([]);
  const [loadingTip, setLoadingTip] = useState('');

  const loadingTips = [
    "正在分析题目内容...",
    "识别几何图形特征...",
    "构建数学模型...",
    "生成 GeoGebra 指令...",
    "正在绘制图形...",
    "即将完成..."
  ];

  useEffect(() => {
    if (isProcessing) {
      let index = 0;
      setLoadingTip(loadingTips[0]);
      const interval = setInterval(() => {
        index = (index + 1) % loadingTips.length;
        setLoadingTip(loadingTips[index]);
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [isProcessing]);

  // Config State
  const [openAIConfig, setOpenAIConfig] = useState<OpenAIConfig>({
    apiKey: '',
    baseUrl: '',
    model: 'gemini-3-flash-preview'
  });

  const ggbRef = useRef<GeoGebraRef>(null);

  // Load sessions on mount
  useEffect(() => {
    setSessions(getSessions());
  }, []);

  useEffect(() => {
    setSessions(getSessions());
  }, [showHistoryModal]);

  // Auto-save session when state changes
  useEffect(() => {
    if (currentSessionId && messages.length > 0) {
      // Debounce the update to avoid capturing too frequently
      const timer = setTimeout(() => {
        if (ggbRef.current) {
          ggbRef.current.getPNGBase64((base64) => {
            if (base64) {
              updateSession(currentSessionId, {
                messages,
                ggbCommands,
                perspective,
                problemText,
                thumbnail: `data:image/png;base64,${base64}`
              });
            } else {
               updateSession(currentSessionId, {
                messages,
                ggbCommands,
                perspective,
                problemText
              });
            }
          });
        } else {
          updateSession(currentSessionId, {
            messages,
            ggbCommands,
            perspective,
            problemText
          });
        }
      }, 2000); // 2 second debounce for image capture

      return () => clearTimeout(timer);
    }
  }, [messages, ggbCommands, perspective, currentSessionId]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImageFile(file);
    }
  };

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
    reader.onloadend = () => {
      setSelectedImage(reader.result as string);
    };
    reader.readAsDataURL(file);
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
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      processImageFile(file);
    }
  };

  const startNewSession = (title: string, pText: string, commands: string[], msgs: ChatMessage[], persp: string) => {
    const newSession = saveSession({
      title: title.slice(0, 50),
      problemText: pText,
      ggbCommands: commands,
      messages: msgs,
      perspective: persp
    });
    setCurrentSessionId(newSession.id);
    return newSession;
  };

  const loadSession = (session: SavedSession) => {
    setCurrentSessionId(session.id);
    setProblemText(session.problemText);
    setMessages(session.messages);
    
    // 1. Set perspective first
    setPerspective(session.perspective);
    
    // 2. Set commands state
    setGgbCommands(session.ggbCommands);
    
    setShowHistoryModal(false);
    setShowInputModal(false);
    
    // 3. Force reset and re-execution with delay to allow perspective switch
    if (ggbRef.current) {
      // Clear immediately
      ggbRef.current.reset();
      
      setTimeout(() => {
        if (ggbRef.current) {
          // Ensure perspective is applied
          ggbRef.current.setPerspective(session.perspective);
          
          // Reset again to be sure (sometimes perspective switch brings back defaults)
          ggbRef.current.reset();
          
          // Execute commands
          session.ggbCommands.forEach(cmd => ggbRef.current?.executeCommand(cmd));
        }
      }, 200); // Increased delay slightly to ensure 3D view is ready
    }
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
    if (!problemText && !selectedImage) return;

    if (!openAIConfig.apiKey) {
      alert("Please configure your API Key in settings first.");
      setShowSettingsModal(true);
      return;
    }

    // Deduct points - disabled
    // if (deductPoints(10)) {
    //   setUser(getCurrentUser()); // Update local state
    // } else {
    //   alert("积分扣除失败，请重试。");
    //   return;
    // }

    setIsProcessing(true);
    try {
      // Strip prefix from base64 string if present
      let base64Data: string | undefined;
      let mimeType: string | undefined;

      if (selectedImage) {
        const parts = selectedImage.split(',');
        base64Data = parts[1];
        mimeType = parts[0].match(/:(.*?);/)?.[1];
      }
      
      const result = await generateGeoGebraCommands(problemText, base64Data, mimeType, openAIConfig);
      
      const { commands, perspective: newPerspective, problemDescription } = result;
      
      setGgbCommands(commands);
      setPerspective(newPerspective);
      setProblemText(problemDescription); // Update problem text with AI description

      // Manually execute commands since we disabled reactive updates in GeoGebra component
      if (ggbRef.current) {
        ggbRef.current.reset();
        // Ensure perspective is set before commands
        ggbRef.current.setPerspective(newPerspective);
        commands.forEach(cmd => ggbRef.current?.executeCommand(cmd));
      }

      // Add initial system message with commands
      const initialContent = `我已经根据你的题目设置好了 GeoGebra 画板。
      
**题目描述：**
${problemDescription}

**生成的 GeoGebra 指令：**
\`\`\`geogebra
${commands.join('\n')}
\`\`\`

你可以自由探索图形，或者让我一步步为你讲解解题思路！`;

      const initialMessages: ChatMessage[] = [
        { 
          role: 'assistant', 
          content: initialContent
        }
      ];

      setMessages(initialMessages);
      
      // Start new session
      startNewSession(problemDescription || "New Problem", problemDescription, commands, initialMessages, newPerspective);
      
      setShowInputModal(false);
    } catch (error) {
      console.error("Failed to process problem:", error);
      alert("Failed to process the problem. Please check your API settings and try again.");
      // Refund points on failure? For simplicity, we won't implement refund logic here yet, 
      // but in a real app you should.
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGGBUpdate = (objName: string) => {
    console.log("Object updated:", objName);
  };

  const [chatWidth, setChatWidth] = useState(400);
  const isResizingRef = useRef(false);

  const startResizing = () => {
    isResizingRef.current = true;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', stopResizing);
    // Add class to body to prevent text selection while resizing
    document.body.classList.add('select-none');
  };

  const stopResizing = () => {
    isResizingRef.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', stopResizing);
    document.body.classList.remove('select-none');
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isResizingRef.current) {
      const newWidth = window.innerWidth - e.clientX;
      // Limit width between 300px and 60% of screen width
      if (newWidth > 300 && newWidth < window.innerWidth * 0.6) {
        setChatWidth(newWidth);
      }
    }
  };

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
            onClick={() => setPerspective("1")}
            className={cn(
              "px-2 py-1 rounded-md transition-all flex items-center gap-1.5 text-xs font-medium",
              perspective === "1" ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
            )}
            title="函数/代数 (Algebra & Graphics)"
          >
            <FunctionSquare className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">函数</span>
          </button>
          <button
            onClick={() => setPerspective("2")}
            className={cn(
              "px-2 py-1 rounded-md transition-all flex items-center gap-1.5 text-xs font-medium",
              perspective === "2" ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
            )}
            title="平面几何 (Geometry)"
          >
            <Triangle className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">平面</span>
          </button>
          <button
            onClick={() => setPerspective("5")}
            className={cn(
              "px-2 py-1 rounded-md transition-all flex items-center gap-1.5 text-xs font-medium",
              perspective === "5" ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
            )}
            title="立体几何 (3D Graphics)"
          >
            <Box className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">立体</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={() => {
              setShowInputModal(true);
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <Calculator className="w-3.5 h-3.5" />
            新题目
          </button>
          
          <button
            onClick={() => setShowHistoryModal(true)}
            className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
            title="历史记录"
          >
            <History className="w-4 h-4" />
          </button>
          
          <button
            onClick={() => ggbRef.current?.downloadGGB()}
            className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
            title="下载 .ggb 文件"
          >
            <Download className="w-4 h-4" />
          </button>
          
          <button
            onClick={() => setShowSettingsModal(true)}
            className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
            title="模型配置"
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
            <div className={cn(
              "bg-white rounded-xl border border-gray-200 shadow-sm p-3 shrink-0 transition-all duration-300",
              isProblemExpanded ? "max-h-[500px]" : "max-h-[100px]"
            )}>
              <div className="flex items-center gap-2 mb-2 text-gray-900 font-medium">
                <FileText className="w-4 h-4 text-blue-600" />
                <span>题目描述</span>
              </div>
              <div className="relative">
                <p className={cn(
                  "text-sm text-gray-600 whitespace-pre-wrap transition-all duration-300",
                  isProblemExpanded ? "" : "line-clamp-3"
                )}>{problemText}</p>
                {!isProblemExpanded && problemText.split('\n').length > 3 && (
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
              onUpdate={handleGGBUpdate}
              onAdd={handleGGBUpdate}
              onRemove={handleGGBUpdate}
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
          >
             <div className="w-1 h-8 bg-gray-300 rounded-full group-hover:bg-blue-500 transition-colors" />
          </div>

          <div className="flex-1 overflow-hidden min-h-0">
            <ScriptEditor 
              initialCode={ggbCommands}
              onSave={(commands) => {
                setGgbCommands(commands);
                // Immediately update session if exists
                if (currentSessionId) {
                  updateSession(currentSessionId, {
                    messages,
                    ggbCommands: commands,
                    perspective,
                    problemText
                  });
                }
              }}
              geminiConfig={openAIConfig}
              onExecute={(cmds) => {
                cmds.forEach(cmd => {
                  if (cmd.trim()) {
                    ggbRef.current?.executeCommand(cmd.trim());
                  }
                });
              }}
              onReset={() => {
                if (ggbRef.current) {
                  if (perspective === "G" || perspective === "5") {
                    const objNames = ggbRef.current.getAllObjectNames();
                    objNames.forEach((name: string) => {
                      try {
                        ggbRef.current.deleteObject(name);
                      } catch (e) {
                        // Ignore errors for objects that can't be deleted
                      }
                    });
                    ggbRef.current.setPerspective(perspective);
                  }
                  ggbRef.current.reset();
                  setTimeout(() => {
                    if (ggbRef.current && perspective) {
                      ggbRef.current.setPerspective(perspective);
                    }
                  }, 50);
                }
              }}
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
        onSave={(apiKey, baseUrl, model) => setOpenAIConfig({ apiKey, baseUrl, model })}
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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowInputModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden relative" onClick={(e) => e.stopPropagation()}>
            
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
              <button onClick={() => setShowInputModal(false)} className="text-gray-400 hover:text-gray-600">
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
                    "mt-1 flex justify-center px-6 pt-8 pb-8 border-2 border-dashed rounded-2xl transition-all cursor-pointer relative group bg-gray-50/30",
                    isDragging 
                      ? "border-blue-500 bg-blue-100/50 scale-[1.02]" 
                      : "border-blue-100 hover:bg-blue-50/50 hover:border-blue-300"
                  )}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <div className="space-y-2 text-center w-full">
                    {selectedImage ? (
                      <div className="relative inline-block">
                        <img src={selectedImage} alt="Preview" className="mx-auto h-48 object-contain rounded-lg shadow-md" />
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedImage(null);
                          }}
                          className="absolute -top-3 -right-3 bg-white text-red-500 rounded-full p-1.5 hover:bg-red-50 shadow-lg border border-gray-100 transition-transform hover:scale-110"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center w-full h-full">
                        <div className={cn(
                          "w-16 h-16 rounded-full flex items-center justify-center mb-4 transition-transform",
                          isDragging ? "bg-blue-500 scale-110" : "bg-blue-100 group-hover:scale-110"
                        )}>
                          <Upload className={cn("h-8 w-8", isDragging ? "text-white" : "text-blue-600")} />
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
                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                  <div className="p-1.5 bg-gray-100 rounded-lg text-gray-600">
                    <MessageSquare className="w-3 h-3" />
                  </div>
                  补充描述 (可选)
                </label>
                <textarea
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
                disabled={(!problemText && !selectedImage) || isProcessing}
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
