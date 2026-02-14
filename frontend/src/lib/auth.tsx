import React, { createContext, useContext, useState, useEffect } from "react";
import * as api from "./api";

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
  const [token, setToken] = useState<string | null>(
    localStorage.getItem("token"),
  );
  const [user, setUser] = useState<User>(null);

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
        localStorage.setItem("token", res.token);
        setToken(res.token);
        setUser(res.user || { id: res.user?.id, email: res.user?.email });
        return true;
      }
      return false;
    } catch (err) {
      return false;
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
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
