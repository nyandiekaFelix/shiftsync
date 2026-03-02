import { Shift, Location, AuthUser } from "@shiftsync/shared-types";
import { apiClient } from "./api-client";

export const shiftService = {
  async create(shift: Partial<Shift>): Promise<Shift> {
    const response = await apiClient.fetch("/shifts", {
      method: "POST",
      body: JSON.stringify(shift),
    });

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ message: "Failed to create shift" }));
      throw new Error(errorData.message || "Failed to create shift");
    }

    return response.json();
  },

  async findAll(
    locationId: string,
    start: string,
    end: string,
  ): Promise<Shift[]> {
    const params = new URLSearchParams({ locationId, start, end });
    const response = await apiClient.fetch(`/shifts?${params.toString()}`);

    if (!response.ok) {
      throw new Error("Failed to fetch shifts");
    }

    return response.json();
  },

  async getLocations(): Promise<Location[]> {
    const response = await apiClient.fetch("/locations");

    if (!response.ok) {
      throw new Error("Failed to fetch locations");
    }

    return response.json();
  },

  async update(id: string, shift: Partial<Shift>): Promise<Shift> {
    const response = await apiClient.fetch(`/shifts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(shift),
    });

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ message: "Failed to update shift" }));
      throw new Error(errorData.message || "Failed to update shift");
    }

    return response.json();
  },

  async delete(id: string): Promise<void> {
    const response = await apiClient.fetch(`/shifts/${id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      throw new Error("Failed to delete shift");
    }
  },

  async assignStaff(shiftId: string, userId: string): Promise<Shift> {
    const response = await apiClient.fetch(`/shifts/${shiftId}/assignments`, {
      method: "POST",
      body: JSON.stringify({ userId }),
    });

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ message: "Failed to assign staff" }));
      throw new Error(errorData.message || "Failed to assign staff");
    }

    return response.json();
  },

  async unassignStaff(shiftId: string, assignmentId: string): Promise<void> {
    const response = await apiClient.fetch(
      `/shifts/${shiftId}/assignments/${assignmentId}`,
      {
        method: "DELETE",
      },
    );

    if (!response.ok) {
      throw new Error("Failed to unassign staff");
    }
  },

  async publishBulk(
    locationId: string,
    start: string,
    end: string,
  ): Promise<{ count: number }> {
    const params = new URLSearchParams({ locationId, start, end });
    const response = await apiClient.fetch(
      `/shifts/publish?${params.toString()}`,
      {
        method: "POST",
      },
    );

    if (!response.ok) {
      throw new Error("Failed to publish shifts");
    }

    return response.json();
  },

  async getUsers(locationId?: string, skill?: string): Promise<AuthUser[]> {
    const params = new URLSearchParams();
    if (locationId) params.append("locationId", locationId);
    if (skill) params.append("skill", skill);

    const response = await apiClient.fetch(`/users?${params.toString()}`);

    if (!response.ok) {
      throw new Error("Failed to fetch users");
    }

    return response.json();
  },
};
