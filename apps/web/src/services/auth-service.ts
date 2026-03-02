export interface User {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'MANAGER' | 'STAFF';
  certifiedLocations: string[];
}

export interface LoginResponse {
  access_token: string;
  user: User;
}

export interface LoginCredentials {
  email: string;
  password?: string;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

export const authService = {
  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    if (!credentials?.email || !credentials?.password) {
      throw new Error('Email and password are required');
    }

    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
      credentials: 'include',
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const message = errorData.message || 'Login failed';
      throw new Error(message);
    }

    const data: LoginResponse = await response.json();
    return data;
  },

  async logout(): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!response.ok) {
      console.warn('Backend logout failed, continuing with client-side cleanup');
    }
  },

  /**
   * getCurrentUser attempts to fetch the profile of the currently logged-in user.
   * If the user is unauthenticated (401), it returns null gracefully.
   * If a network error occurs, it throws an error.
   */
  async getCurrentUser(): Promise<User | null> {
    const response = await fetch(`${API_BASE_URL}/users/me`, {
      credentials: 'include',
    });

    if (response.status === 401 || response.status === 403) {
      return null;
    }

    if (!response.ok) {
      throw new Error('Failed to fetch user session');
    }

    const data: User = await response.json();
    return data;
  },
};
