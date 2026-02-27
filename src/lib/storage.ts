import { ChatMessage } from '../lib/gemini';

export interface SavedSession {
  id: string;
  title: string;
  timestamp: number;
  problemText: string;
  ggbCommands: string[];
  messages: ChatMessage[];
  perspective: string;
  thumbnail?: string;
}

const STORAGE_KEY = 'geogebra_tutor_sessions';

export function saveSession(session: Omit<SavedSession, 'id' | 'timestamp'>): SavedSession {
  const sessions = getSessions();
  const newSession: SavedSession = {
    ...session,
    id: crypto.randomUUID(),
    timestamp: Date.now(),
  };
  
  sessions.unshift(newSession);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  return newSession;
}

export function updateSession(id: string, updates: Partial<SavedSession>): void {
  const sessions = getSessions();
  const index = sessions.findIndex(s => s.id === id);
  
  if (index !== -1) {
    // If thumbnail is provided, use it. If not, keep the existing one unless explicitly set to undefined (which we don't do).
    // Actually, updates will contain the new thumbnail if we captured it.
    sessions[index] = { ...sessions[index], ...updates, timestamp: Date.now() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  }
}

export function getSessions(): SavedSession[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    console.error("Failed to load sessions:", e);
    return [];
  }
}

export function deleteSession(id: string): void {
  const sessions = getSessions().filter(s => s.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

export function getSession(id: string): SavedSession | undefined {
  return getSessions().find(s => s.id === id);
}
