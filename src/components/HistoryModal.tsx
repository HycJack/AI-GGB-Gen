import React from 'react';
import { X, Clock, Trash2, MessageSquare } from 'lucide-react';
import { SavedSession, deleteSession } from '../lib/storage';
import { cn } from '../lib/utils';

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSession: (session: SavedSession) => void;
  sessions: SavedSession[];
  onDeleteSession: (id: string) => void;
}

export default function HistoryModal({ 
  isOpen, 
  onClose, 
  onSelectSession, 
  sessions,
  onDeleteSession 
}: HistoryModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-600" />
            历史记录
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {sessions.length === 0 ? (
            <div className="text-center text-gray-500 py-10">
              <MessageSquare className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>暂无历史记录</p>
            </div>
          ) : (
            sessions.map((session) => (
              <div 
                key={session.id}
                className="group bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer relative"
                onClick={() => onSelectSession(session)}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1 pr-8">
                    <h3 className="font-medium text-gray-900 line-clamp-1">
                      {session.title || session.problemText.slice(0, 30) || "未命名会话"}
                    </h3>
                    <p className="text-sm text-gray-500 line-clamp-2 mt-1 h-10">
                      {session.problemText || "无题目描述"}
                    </p>
                  </div>
                  
                  {session.thumbnail && (
                    <div className="w-16 h-16 rounded-lg border border-gray-200 overflow-hidden shrink-0 bg-gray-50">
                      <img src={session.thumbnail} alt="Thumbnail" className="w-full h-full object-contain" />
                    </div>
                  )}

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteSession(session.id);
                    }}
                    className="text-gray-400 hover:text-red-500 p-1 rounded-full hover:bg-red-50 transition-colors absolute top-3 right-3 opacity-0 group-hover:opacity-100"
                    title="删除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                
                <div className="flex items-center justify-between text-xs text-gray-400 mt-2">
                  <span>{new Date(session.timestamp).toLocaleString()}</span>
                  <span className={cn(
                    "px-2 py-0.5 rounded-full bg-gray-100",
                    session.perspective === "5" ? "text-purple-600 bg-purple-50" : 
                    session.perspective === "1" ? "text-green-600 bg-green-50" : "text-blue-600 bg-blue-50"
                  )}>
                    {session.perspective === "5" ? "立体几何" : session.perspective === "1" ? "函数" : "平面几何"}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
