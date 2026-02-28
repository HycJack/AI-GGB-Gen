import React, { useState, useRef, useEffect } from 'react';
import { User, LogOut, X, ChevronRight, ChevronDown } from 'lucide-react';
import { User as UserType } from '../lib/user';
import { cn } from '../lib/utils';

interface UserProfileDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserType | null;
  onLogout: () => void;
  triggerRef: React.RefObject<HTMLButtonElement>;
}

export default function UserProfileDropdown({ 
  isOpen, 
  onClose, 
  user, 
  onLogout,
  triggerRef
}: UserProfileDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current && 
        !dropdownRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose, triggerRef]);

  if (!isOpen || !user) return null;

  return (
    <div 
      ref={dropdownRef}
      className="absolute right-6 top-16 w-72 bg-white rounded-xl shadow-xl border border-gray-100 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200"
    >
      {/* User Info Header */}
      <div className="p-4 bg-gray-50 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-sm">
            {user.username.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-gray-900 truncate">{user.username}</h3>
            <p className="text-xs text-gray-500 truncate">上次登录: {user.lastLoginDate}</p>
          </div>
        </div>
      </div>
      
      <div className="p-2">
        {/* Points Card - disabled */}
        {/* <div className="bg-orange-50 border border-orange-100 rounded-lg p-3 mb-2">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Coins className="w-4 h-4 text-orange-600" />
              <span className="text-sm font-medium text-orange-700">当前积分</span>
            </div>
            <span className="text-lg font-bold text-orange-700">{user.points}</span>
          </div>
          <div className="flex justify-between text-[10px] text-orange-500">
            <span>每日登录 +10</span>
            <span>每题消耗 -10</span>
          </div>
        </div> */}

        {/* Menu Items */}
        <div className="space-y-1">
          <button 
            onClick={() => {
              onLogout();
              onClose();
            }}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            退出登录
          </button>
        </div>
      </div>
    </div>
  );
}
