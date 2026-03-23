import React, {
  createContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from "react";
import * as api from "../lib/api";
import {
  getStoredAuthUser,
  setStoredAuthUser,
  getAuthToken,
  clearStoredAuthUser,
} from "./authStorage";

export interface User {
  id: string;
  userId: string;
  email: string;
  name: string;
  role: "student" | "examiner" | "admin";
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  login: (
    email: string,
    password: string,
    expectedRole?: User["role"],
    rememberMe?: boolean,
  ) => Promise<void>;
  logout: () => void;
  register: (
    email: string,
    password: string,
    name: string,
    userId: string,
    role?: string,
  ) => Promise<void>;
}

// Restore user from tab-scoped storage
const getStoredUser = (): User | null => {
  const token = getAuthToken();
  if (!token) return null;
  return getStoredAuthUser<User>();
};

// Save user to tab-scoped storage
const storeUser = (user: User | null) => {
  setStoredAuthUser(user);
};

export const AuthContext = createContext<AuthContextType | undefined>(
  undefined,
);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Initialize user from storage for current tab session persistence
  const [user, setUser] = useState<User | null>(() => getStoredUser());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync user state with storage
  useEffect(() => {
    storeUser(user);
  }, [user]);

  // Reconcile cached user with backend source of truth (role may have changed).
  useEffect(() => {
    const token = getAuthToken();
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
          clearStoredAuthUser();
          setUser(null);
        }
      })
      .catch(() => {
        if (cancelled) return;
        api.clearToken();
        clearStoredAuthUser();
        setUser(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(
    async (
      email: string,
      password: string,
      expectedRole?: User["role"],
      rememberMe = false,
    ) => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await api.login(email, password, rememberMe);
        if (res?.success && res?.token && res?.user) {
          const actualRole = res.user.role as User["role"];
          if (expectedRole && actualRole !== expectedRole) {
            const roleLabel = expectedRole.charAt(0).toUpperCase() + expectedRole.slice(1);
            const message = `${roleLabel} login only allows ${expectedRole} accounts.`;
            setError(message);
            throw new Error(message);
          }

          api.setToken(res.token, { remember: rememberMe });
          setUser(res.user);
          return;
        }

        const message = res?.message || "Login failed";
        setError(message);
        throw new Error(message);
      } catch (err: any) {
        const message = err?.message || "Login error";
        setError(message);
        throw err instanceof Error ? err : new Error(message);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

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
    async (email: string, password: string, name: string, userId: string, role = "student") => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await api.register(email, password, name, userId, role);
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
