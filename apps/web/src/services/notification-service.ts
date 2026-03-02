import { NotificationItem } from "@shiftsync/shared-types";
import { apiClient } from "./api-client";

export const notificationService = {
  async list(unreadOnly = false, limit = 20): Promise<NotificationItem[]> {
    const params = new URLSearchParams({
      unreadOnly: unreadOnly ? "true" : "false",
      limit: String(limit),
    });

    const response = await apiClient.fetch(
      `/notifications?${params.toString()}`,
    );

    if (!response.ok) {
      throw new Error("Failed to fetch notifications");
    }

    return response.json();
  },

  async markRead(id: string): Promise<void> {
    const response = await apiClient.fetch(`/notifications/${id}/read`, {
      method: "POST",
    });

    if (!response.ok) {
      throw new Error("Failed to mark notification as read");
    }
  },

  async markAllRead(): Promise<void> {
    const response = await apiClient.fetch("/notifications/read-all", {
      method: "POST",
    });

    if (!response.ok) {
      throw new Error("Failed to mark notifications as read");
    }
  },
};
