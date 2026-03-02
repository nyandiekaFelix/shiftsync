const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "/api/v1";

export const AUTH_ERROR_EVENT = "SHIFTSYNC_AUTH_ERROR";

interface RequestOptions extends RequestInit {
  silentAuth?: boolean;
}

export const apiClient = {
  async fetch(endpoint: string, options: RequestOptions = {}) {
    const { silentAuth = false, ...fetchOptions } = options;
    const url = endpoint.startsWith("http")
      ? endpoint
      : `${API_BASE_URL}${endpoint}`;

    // Ensure credentials are set to 'include' by default for cookie-based auth
    const defaultOptions: RequestInit = {
      credentials: "include",
      ...fetchOptions,
      headers: {
        "Content-Type": "application/json",
        ...fetchOptions.headers,
      },
    };

    const response = await fetch(url, defaultOptions);

    if ((response.status === 401 || response.status === 403) && !silentAuth) {
      // Trigger global event for AuthContext to handle
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(AUTH_ERROR_EVENT));
      }
    }

    return response;
  },
};
