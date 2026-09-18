import type { ChatMessage, Perspective } from './gemini';

export interface SavedSession {
  id: string;
  title: string;
  timestamp: number;
  problemText: string;
  ggbCommands: string[];
  messages: ChatMessage[];
  perspective: Perspective;
  thumbnail?: string;
}

export interface SavedApiConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

const STORAGE_KEY = 'geogebra_tutor_sessions';
const API_CONFIG_KEY = 'geogebra_tutor_api_config';

/** Hard cap on stored sessions — the newest are kept. */
export const MAX_SESSIONS = 30;

/** Thumbnails are only kept for this many newest sessions under quota pressure. */
const THUMBNAIL_KEEP = 5;

function isQuotaError(e: unknown): boolean {
  return (
    e instanceof DOMException &&
    (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')
  );
}

function readSessions(): SavedSession[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? (parsed as SavedSession[]) : [];
  } catch (e) {
    console.error('Failed to load sessions:', e);
    return [];
  }
}

/**
 * Persist the session list, giving up the least valuable data first when the
 * localStorage quota is exceeded: older thumbnails, then older sessions.
 * Never throws for a quota failure — logging that is preferable to crashing
 * the UI because a preview image could not be saved.
 */
function writeSessions(sessions: SavedSession[]): void {
  const capped = sessions.slice(0, MAX_SESSIONS);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(capped));
    return;
  } catch (e) {
    if (!isQuotaError(e)) throw e;
  }

  const withoutOldThumbnails = capped.map((s, i) =>
    i < THUMBNAIL_KEEP ? s : { ...s, thumbnail: undefined }
  );
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(withoutOldThumbnails));
    return;
  } catch (e) {
    if (!isQuotaError(e)) throw e;
  }

  console.warn(
    'localStorage quota exceeded; keeping only the newest ' + THUMBNAIL_KEEP + ' sessions.'
  );
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(capped.slice(0, THUMBNAIL_KEEP)));
  } catch (e) {
    console.error('Failed to persist sessions:', e);
  }
}

export function saveSession(session: Omit<SavedSession, 'id' | 'timestamp'>): SavedSession {
  const sessions = readSessions();
  const newSession: SavedSession = {
    ...session,
    id: crypto.randomUUID(),
    timestamp: Date.now(),
  };
  writeSessions([newSession, ...sessions]);
  return newSession;
}

export function updateSession(id: string, updates: Partial<SavedSession>): void {
  const sessions = readSessions();
  const index = sessions.findIndex((s) => s.id === id);
  if (index === -1) return;

  sessions[index] = { ...sessions[index], ...updates, timestamp: Date.now() };
  writeSessions(sessions);
}

export function getSessions(): SavedSession[] {
  return readSessions();
}

export function deleteSession(id: string): void {
  writeSessions(readSessions().filter((s) => s.id !== id));
}

export function saveApiConfig(config: SavedApiConfig): void {
  try {
    localStorage.setItem(API_CONFIG_KEY, JSON.stringify(config));
  } catch (e) {
    console.error('Failed to save API config:', e);
  }
}

export function getApiConfig(): SavedApiConfig | null {
  try {
    const stored = localStorage.getItem(API_CONFIG_KEY);
    return stored ? (JSON.parse(stored) as SavedApiConfig) : null;
  } catch (e) {
    console.error('Failed to load API config:', e);
    return null;
  }
}

/**
 * Downscale a base64 image so stored session thumbnails stay small.
 * `base64` is expected without the `data:` prefix. Resolves to the original
 * string when downscaling is unnecessary or fails.
 */
export function downscaleBase64(
  base64: string,
  mimeType: string,
  maxDim: number = 192
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      if (scale >= 1) {
        resolve(base64);
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(base64);
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL(`image/${mimeType}`, 0.8).split(',')[1]);
    };
    img.onerror = () => resolve(base64);
    img.src = `data:${mimeType};base64,${base64}`;
  });
}
