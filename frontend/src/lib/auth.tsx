import React, { createContext, useContext, useState, useEffect } from "react";
import * as api from "./api";
import {
  getAuthToken,
  setAuthToken,
  clearAuthToken,
  getStoredAuthUser,
  setStoredAuthUser,
  clearStoredAuthUser,
} from "./authStorage";

type User = { id: string; email: string; name?: string; role?: string } | null;

const AuthContext = createContext<{
  user: User;
  token: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
}>({
  user: null,
  token: null,
  login: async () => false,
  logout: () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [token, setToken] = useState<string | null>(getAuthToken());
  const [user, setUser] = useState<User>(() => getStoredAuthUser<User>());

  useEffect(() => {
    if (token) {
      api.setToken(token);
      // optionally fetch user profile here
    }
  }, [token]);

  const login = async (email: string, password: string) => {
    try {
      const res = await api.login(email, password);
      if (res?.token) {
        setAuthToken(res.token);
        setToken(res.token);
        const nextUser = res.user || { id: res.user?.id, email: res.user?.email };
        setStoredAuthUser(nextUser);
        setUser(nextUser);
        return true;
      }
      return false;
    } catch (err) {
      return false;
    }
  };

  const logout = () => {
    clearAuthToken();
    clearStoredAuthUser();
    setToken(null);
    setUser(null);
    api.clearToken();
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
