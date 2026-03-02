"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { useRouter } from "next/navigation";
import { AuthUser, LoginCredentials } from "@shiftsync/shared-types";
import { authService } from "@/services/auth-service";
import { AUTH_ERROR_EVENT } from "@/services/api-client";

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const logout = useCallback(
    async (isExpired = false) => {
      try {
        await authService.logout();
      } catch (err) {
        console.error("Logout failed:", err);
      } finally {
        setUser(null);
        // Add 'expired' param to break middleware redirect loops if a stale cookie persists
        const loginUrl = isExpired ? "/login?expired=1" : "/login";
        router.push(loginUrl);
      }
    },
    [router],
  );

  useEffect(() => {
    const handleAuthError = () => {
      console.warn("Authentication error detected, clearing session...");
      logout(true);
    };

    window.addEventListener(AUTH_ERROR_EVENT, handleAuthError);
    return () => window.removeEventListener(AUTH_ERROR_EVENT, handleAuthError);
  }, [logout]);

  const checkAuth = useCallback(async () => {
    try {
      const userData = await authService.getCurrentUser();

      if (!userData) {
        // If userData is null but middleware sent us here, we MUST clear cookies immediately.
        // We await this to ensure the cookie is gone before we allow the layout to potentially redirect.
        console.warn("No user data found, performing hard logout cleanup...");
        await logout(true);
        return; // logout will handle the redirect and state clearing
      }

      setUser(userData);
    } catch (error) {
      console.error("Initial auth check failed:", error);
      setUser(null);
      await logout(true);
    } finally {
      setIsLoading(false);
    }
  }, [logout]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = async (credentials: LoginCredentials) => {
    const data = await authService.login(credentials);
    setUser(data.user);

    if (data.user.role === "ADMIN" || data.user.role === "MANAGER") {
      router.push("/dashboard");
    } else if (data.user.role === "STAFF") {
      router.push("/schedule");
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
