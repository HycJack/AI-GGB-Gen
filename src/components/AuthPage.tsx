import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { User, Lock, ArrowRight, Mail, Sparkles, Globe2, GraduationCap } from 'lucide-react';
import { cn } from '../lib/utils';

interface AuthPageProps {
  onLogin: (username: string, password?: string) => void;
}

export default function AuthPage({ onLogin }: AuthPageProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    // Simulate network delay for effect
    await new Promise(resolve => setTimeout(resolve, 800));
    
    if (isLogin) {
      onLogin(username, password);
    } else {
      // For demo, registration just logs in
      onLogin(username, password);
    }
    setIsLoading(false);
  };

  const toggleMode = () => {
    setIsLogin(!isLogin);
    setUsername('');
    setPassword('');
    setEmail('');
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-100 p-4">
      <div className="w-full max-w-5xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col lg:flex-row h-[600px]">
        {/* Left Column - Image & Branding */}
        <div className="hidden lg:flex w-1/2 bg-slate-900 relative overflow-hidden flex-col justify-between p-12 text-white">
          {/* Background Pattern/Image */}
          <div className="absolute inset-0 z-0">
               <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1635070041078-e363dbe005cb?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center opacity-20" />
               <div className="absolute inset-0 bg-gradient-to-br from-blue-900/90 to-purple-900/90 mix-blend-multiply" />
          </div>
          
          {/* Decorative Circles */}
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-blue-500/20 blur-3xl animate-pulse" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-purple-500/20 blur-3xl animate-pulse delay-1000" />

          {/* Content */}
          <div className="relative z-10">
            <div className="flex items-center gap-2 text-xl font-bold">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-900/50">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              GeoGebra AI Tutor
            </div>
          </div>

          <div className="relative z-10 max-w-lg">
            <h1 className="text-3xl font-bold mb-4 leading-tight">
              探索几何的无限可能
              <br />
              <span className="text-blue-400">AI 辅助教学</span>
            </h1>
            <p className="text-slate-300 text-base mb-6 leading-relaxed">
              结合 GeoGebra 的强大绘图能力与 AI 的智能辅导，为您提供个性化的几何学习体验。
            </p>
            
            <div className="flex gap-6 text-sm text-slate-400 font-medium">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-500/10 rounded-lg">
                  <Globe2 className="w-4 h-4 text-blue-400" />
                </div>
                <span>智能绘图</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="p-2 bg-purple-500/10 rounded-lg">
                  <GraduationCap className="w-4 h-4 text-purple-400" />
                </div>
                <span>实时辅导</span>
              </div>
            </div>
          </div>

          <div className="relative z-10 text-xs text-slate-500">
            &copy; 2024 GeoGebra AI Tutor. All rights reserved.
          </div>
        </div>

        {/* Right Column - Form */}
        <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-white relative">
          <div className="w-full max-w-sm" style={{ perspective: 1000 }}>
            <AnimatePresence mode="wait">
              <motion.div
                key={isLogin ? 'login' : 'register'}
                initial={{ rotateY: 90, opacity: 0 }}
                animate={{ rotateY: 0, opacity: 1 }}
                exit={{ rotateY: -90, opacity: 0 }}
                transition={{ duration: 0.4, type: "spring", stiffness: 260, damping: 20 }}
                className="bg-white rounded-xl overflow-hidden p-4"
              >
                <div className="text-center mb-6">
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">
                    {isLogin ? '欢迎回来' : '创建新账号'}
                  </h2>
                  <p className="text-gray-500 text-sm">
                    {isLogin ? '请输入您的账号信息以登录' : '填写以下信息以开始注册'}
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                   <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">用户名</label>
                        <div className="relative group">
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                          <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                            placeholder="请输入用户名"
                            required
                          />
                        </div>
                      </div>

                      {!isLogin && (
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-gray-700">邮箱</label>
                          <div className="relative group">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                            <input
                              type="email"
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                              placeholder="name@example.com"
                              required={!isLogin}
                            />
                          </div>
                        </div>
                      )}

                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">密码</label>
                        <div className="relative group">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                          <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                            placeholder="••••••••"
                          />
                        </div>
                      </div>
                   </div>

                   <button
                      type="submit"
                      disabled={isLoading || !username}
                      className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-6 shadow-lg shadow-blue-200"
                    >
                      {isLoading ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <>
                          {isLogin ? '登录' : '注册'}
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>

                    <div className="relative my-6">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-gray-100"></div>
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-white px-2 text-gray-400">或者</span>
                      </div>
                    </div>

                    <div className="text-center">
                      <button
                        type="button"
                        onClick={toggleMode}
                        className="text-sm text-gray-600 hover:text-gray-900 font-medium transition-colors"
                      >
                        {isLogin ? (
                          <>
                            还没有账号？ <span className="text-blue-600 hover:underline">去注册</span>
                          </>
                        ) : (
                          <>
                            已有账号？ <span className="text-blue-600 hover:underline">去登录</span>
                          </>
                        )}
                      </button>
                    </div>
                </form>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
