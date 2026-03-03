import {
  Shift,
  Location,
  AuthUser,
  AssignStaffResponse,
  ConstraintViolationPayload,
  SwapRequest,
} from "@shiftsync/shared-types";
import { apiClient } from "./api-client";

const createIdempotencyKey = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `idem-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export class ConstraintViolationError extends Error {
  readonly payload: ConstraintViolationPayload;

  constructor(payload: ConstraintViolationPayload) {
    super(payload.message);
    this.name = "ConstraintViolationError";
    this.payload = payload;
  }
}

export const shiftService = {
  async create(shift: Partial<Shift>): Promise<Shift> {
    const response = await apiClient.fetch("/shifts", {
      method: "POST",
      body: JSON.stringify(shift),
      headers: {
        "Idempotency-Key": createIdempotencyKey(),
      },
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
      headers: {
        "Idempotency-Key": createIdempotencyKey(),
      },
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

  async assignStaff(
    shiftId: string,
    userId: string,
    managerOverrideReason?: string,
  ): Promise<AssignStaffResponse> {
    const payload: { userId: string; managerOverride?: { reason: string } } = {
      userId,
    };
    if (managerOverrideReason?.trim()) {
      payload.managerOverride = { reason: managerOverrideReason.trim() };
    }

    const response = await apiClient.fetch(`/shifts/${shiftId}/assignments`, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: {
        "Idempotency-Key": createIdempotencyKey(),
      },
    });

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ message: "Failed to assign staff" }));
      if (
        errorData &&
        typeof errorData === "object" &&
        "details" in errorData &&
        "rule" in errorData
      ) {
        throw new ConstraintViolationError(
          errorData as ConstraintViolationPayload,
        );
      }
      if (response.status === 409) {
        throw new Error("Conflict");
      }
      throw new Error(errorData.message || "Failed to assign staff");
    }

    return response.json();
  },

  async previewAssignment(
    shiftId: string,
    userId: string,
    managerOverrideReason?: string,
    hourlyRate?: number,
  ): Promise<{
    blocks: unknown[];
    warnings: unknown[];
    suggestions: { userId: string; name: string }[];
    overtimeCostImpact: number;
  }> {
    const response = await apiClient.fetch(
      `/shifts/${shiftId}/assignments/preview`,
      {
        method: "POST",
        body: JSON.stringify({
          userId,
          managerOverrideReason,
          hourlyRate,
        }),
      },
    );
    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ message: "Failed to preview assignment" }));
      throw new Error(errorData.message || "Failed to preview assignment");
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

  async getLiveShifts(locationId: string): Promise<Shift[]> {
    const params = new URLSearchParams({ locationId });
    const response = await apiClient.fetch(`/shifts/live?${params.toString()}`);

    if (!response.ok) {
      throw new Error("Failed to fetch live shifts");
    }

    return response.json();
  },

  async requestSwap(shiftId: string, receiverId: string): Promise<SwapRequest> {
    const response = await apiClient.fetch("/swap-requests/swap", {
      method: "POST",
      body: JSON.stringify({ shiftId, receiverId }),
      headers: {
        "Idempotency-Key": createIdempotencyKey(),
      },
    });

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ message: "Failed to request swap" }));
      throw new Error(errorData.message || "Failed to request swap");
    }

    return response.json();
  },

  async requestDrop(shiftId: string): Promise<SwapRequest> {
    const response = await apiClient.fetch("/swap-requests/drop", {
      method: "POST",
      body: JSON.stringify({ shiftId }),
      headers: {
        "Idempotency-Key": createIdempotencyKey(),
      },
    });

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ message: "Failed to request drop" }));
      throw new Error(errorData.message || "Failed to request drop");
    }

    return response.json();
  },

  async acceptSwapRequest(requestId: string): Promise<SwapRequest> {
    const response = await apiClient.fetch(
      `/swap-requests/${requestId}/accept`,
      {
        method: "POST",
        headers: {
          "Idempotency-Key": createIdempotencyKey(),
        },
      },
    );

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ message: "Failed to accept request" }));
      throw new Error(errorData.message || "Failed to accept request");
    }

    return response.json();
  },

  async cancelSwapRequest(requestId: string): Promise<SwapRequest> {
    const response = await apiClient.fetch(
      `/swap-requests/${requestId}/cancel`,
      {
        method: "POST",
        headers: {
          "Idempotency-Key": createIdempotencyKey(),
        },
      },
    );

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ message: "Failed to cancel request" }));
      throw new Error(errorData.message || "Failed to cancel request");
    }

    return response.json();
  },

  async approveSwapRequest(
    requestId: string,
    approve: boolean,
    reason?: string,
  ): Promise<{
    request: SwapRequest;
  }> {
    const response = await apiClient.fetch(
      `/swap-requests/${requestId}/approve`,
      {
        method: "POST",
        body: JSON.stringify({ approve, reason }),
        headers: {
          "Idempotency-Key": createIdempotencyKey(),
        },
      },
    );

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ message: "Failed to review request" }));
      throw new Error(errorData.message || "Failed to review request");
    }

    return response.json();
  },

  async listSwapRequests(
    scope?: "approval" | "drop-board",
  ): Promise<SwapRequest[]> {
    const params = new URLSearchParams();
    if (scope) {
      params.set("scope", scope);
    }
    const suffix = params.toString() ? `?${params.toString()}` : "";
    const response = await apiClient.fetch(`/swap-requests${suffix}`);

    if (!response.ok) {
      throw new Error("Failed to fetch swap requests");
    }

    return response.json();
  },
};
