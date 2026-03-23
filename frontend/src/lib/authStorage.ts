const TOKEN_KEY = "token";
const USER_KEY = "smartproctor_user";
const REMEMBER_UNTIL_KEY = "smartproctor_remember_until";
const DEFAULT_REMEMBER_MS = 7 * 24 * 60 * 60 * 1000;
const AUTH_MODE =
  String((import.meta as any).env.VITE_AUTH_MODE || "tab").toLowerCase();

type AuthWriteOptions = {
  remember?: boolean;
  persistForMs?: number;
};

function isLegacyLocalMode() {
  return AUTH_MODE === "legacy-local";
}

function getRememberUntil(): number | null {
  try {
    const raw = localStorage.getItem(REMEMBER_UNTIL_KEY);
    if (!raw) return null;
    const until = Number(raw);
    return Number.isFinite(until) ? until : null;
  } catch {
    return null;
  }
}

function clearRememberMarker() {
  try {
    localStorage.removeItem(REMEMBER_UNTIL_KEY);
  } catch {
    // Ignore storage failures
  }
}

function clearPersistentAuthData() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Ignore storage failures
  }
  try {
    localStorage.removeItem(USER_KEY);
  } catch {
    // Ignore storage failures
  }
  clearRememberMarker();
}

export function isRememberedAuthActive(): boolean {
  if (isLegacyLocalMode()) return true;
  const until = getRememberUntil();
  if (!until) return false;
  if (Date.now() <= until) return true;
  clearPersistentAuthData();
  return false;
}

export function getAuthToken(): string | null {
  if (isLegacyLocalMode()) {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  }

  try {
    const sessionToken = sessionStorage.getItem(TOKEN_KEY);
    if (sessionToken) return sessionToken;
  } catch {
    // Ignore storage failures
  }

  if (!isRememberedAuthActive()) return null;

  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string, options: AuthWriteOptions = {}) {
  const remember = options.remember ?? false;

  if (isLegacyLocalMode()) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      // Ignore storage failures
    }
    return;
  }

  try {
    sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Ignore storage failures
  }

  if (remember) {
    const persistForMs = Math.max(1000, options.persistForMs ?? DEFAULT_REMEMBER_MS);
    try {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(REMEMBER_UNTIL_KEY, String(Date.now() + persistForMs));
    } catch {
      // Ignore storage failures
    }
  } else {
    clearPersistentAuthData();
  }
}

export function clearAuthToken() {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // Ignore storage failures
  }
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Ignore storage failures
  }
  clearRememberMarker();
}

export function getStoredAuthUser<T = unknown>(): T | null {
  if (isLegacyLocalMode()) {
    try {
      const stored = localStorage.getItem(USER_KEY);
      if (!stored) return null;
      return JSON.parse(stored) as T;
    } catch {
      return null;
    }
  }

  try {
    const sessionToken = sessionStorage.getItem(TOKEN_KEY);
    if (sessionToken) {
      const sessionUser = sessionStorage.getItem(USER_KEY);
      if (!sessionUser) return null;
      return JSON.parse(sessionUser) as T;
    }
  } catch {
    // Ignore storage failures
  }

  if (!isRememberedAuthActive()) return null;

  try {
    const stored = localStorage.getItem(USER_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as T;
  } catch {
    return null;
  }
}

export function setStoredAuthUser(value: unknown | null, options: AuthWriteOptions = {}) {
  const remember = options.remember ?? isRememberedAuthActive();

  if (value === null) {
    clearStoredAuthUser();
    return;
  }

  if (isLegacyLocalMode()) {
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(value));
    } catch {
      // Ignore storage failures
    }
    return;
  }

  try {
    sessionStorage.setItem(USER_KEY, JSON.stringify(value));
  } catch {
    // Ignore storage failures
  }

  if (remember) {
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(value));
      if (!getRememberUntil()) {
        localStorage.setItem(
          REMEMBER_UNTIL_KEY,
          String(Date.now() + DEFAULT_REMEMBER_MS),
        );
      }
    } catch {
      // Ignore storage failures
    }
  } else {
    try {
      localStorage.removeItem(USER_KEY);
    } catch {
      // Ignore storage failures
    }
  }
}

export function clearStoredAuthUser() {
  try {
    sessionStorage.removeItem(USER_KEY);
  } catch {
    // Ignore storage failures
  }
  try {
    localStorage.removeItem(USER_KEY);
  } catch {
    // Ignore storage failures
  }
  clearRememberMarker();
}

export function clearAuthSessionStorage() {
  clearAuthToken();
  clearStoredAuthUser();
}
