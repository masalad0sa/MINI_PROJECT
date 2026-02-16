import React, {
  createContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from "react";
import * as api from "../lib/api";

export interface User {
  id: string;
  userId: string;
  email: string;
  name: string;
  role: "student" | "examiner" | "admin" | "moderator";
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  register: (
    email: string,
    password: string,
    name: string,
    role?: string,
  ) => Promise<void>;
}

const STORAGE_KEY = "smartproctor_user";
const TOKEN_KEY = "token";

// Restore user from localStorage
const getStoredUser = (): User | null => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const token = localStorage.getItem(TOKEN_KEY);
    if (stored && token) {
      return JSON.parse(stored);
    }
  } catch {
    // Invalid stored data
  }
  return null;
};

// Save user to localStorage
const storeUser = (user: User | null) => {
  if (user) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
};

export const AuthContext = createContext<AuthContextType | undefined>(
  undefined,
);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Initialize user from localStorage for session persistence
  const [user, setUser] = useState<User | null>(() => getStoredUser());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync user state with localStorage
  useEffect(() => {
    storeUser(user);
  }, [user]);

  // Reconcile cached user with backend source of truth (role may have changed).
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    api
      .getCurrentUser()
      .then((res) => {
        if (cancelled) return;
        if (res?.success && res?.user) {
          setUser(res.user);
        } else {
          api.clearToken();
          localStorage.removeItem(STORAGE_KEY);
          setUser(null);
        }
      })
      .catch(() => {
        if (cancelled) return;
        api.clearToken();
        localStorage.removeItem(STORAGE_KEY);
        setUser(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.login(email, password);
      if (res?.success && res?.token) {
        api.setToken(res.token);
        setUser(res.user);
      } else {
        setError(res?.message || "Login failed");
      }
    } catch (err: any) {
      setError(err.message || "Login error");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      // Call logout API to blacklist token
      await api.logout();
    } catch {
      // Ignore errors - still clear local state
    }
    api.clearToken();
    setUser(null);
    setError(null);
  }, []);

  const register = useCallback(
    async (email: string, password: string, name: string, role = "student") => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await api.register(email, password, name, role);
        if (res?.success && res?.token) {
          api.setToken(res.token);
          setUser(res.user);
        } else {
          setError(res?.message || "Registration failed");
        }
      } catch (err: any) {
        setError(err.message || "Registration error");
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  return (
    <AuthContext.Provider
      value={{ user, isLoading, error, login, logout, register }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

