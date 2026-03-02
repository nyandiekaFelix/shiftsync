import {
  AuthUser,
  LoginResponse,
  LoginCredentials,
} from "@shiftsync/shared-types";
import { apiClient } from "./api-client";

export const authService = {
  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    if (!credentials?.email || !credentials?.password) {
      throw new Error("Email and password are required");
    }

    const response = await apiClient.fetch("/auth/login", {
      method: "POST",
      body: JSON.stringify(credentials),
      silentAuth: true,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const message = errorData.message || "Login failed";
      throw new Error(message);
    }

    const data: LoginResponse = await response.json();
    return data;
  },

  async logout(): Promise<void> {
    const response = await apiClient.fetch("/auth/logout", {
      method: "POST",
      silentAuth: true,
    });
    if (!response.ok) {
      console.warn(
        "Backend logout failed, continuing with client-side cleanup",
      );
    }
  },

  async getCurrentUser(): Promise<AuthUser | null> {
    const response = await apiClient.fetch("/users/me", {
      silentAuth: true,
    });

    if (response.status === 401 || response.status === 403) {
      return null;
    }

    if (!response.ok) {
      throw new Error("Failed to fetch user session");
    }

    const data: AuthUser = await response.json();
    return data;
  },
};
