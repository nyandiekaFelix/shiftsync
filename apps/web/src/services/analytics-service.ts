import { AuditLogEntry, FairnessReport } from "@shiftsync/shared-types";
import { apiClient } from "./api-client";

export const analyticsService = {
  async getFairnessReport(
    from: string,
    to: string,
    locationId?: string,
  ): Promise<FairnessReport> {
    const params = new URLSearchParams({ from, to });
    if (locationId) {
      params.set("locationId", locationId);
    }

    const response = await apiClient.fetch(
      `/fairness/report?${params.toString()}`,
    );
    if (!response.ok) {
      throw new Error("Failed to fetch fairness report");
    }

    return response.json();
  },

  async getAuditLogs(filters: {
    shiftId?: string;
    userId?: string;
    from?: string;
    to?: string;
    limit?: number;
  }): Promise<AuditLogEntry[]> {
    const params = new URLSearchParams();
    if (filters.shiftId) params.set("shiftId", filters.shiftId);
    if (filters.userId) params.set("userId", filters.userId);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    if (filters.limit) params.set("limit", String(filters.limit));

    const suffix = params.toString() ? `?${params.toString()}` : "";
    const response = await apiClient.fetch(`/audit-logs${suffix}`);

    if (!response.ok) {
      throw new Error("Failed to fetch audit logs");
    }

    return response.json();
  },
};
