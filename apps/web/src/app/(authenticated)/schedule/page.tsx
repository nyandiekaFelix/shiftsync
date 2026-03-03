"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/auth-context";
import { shiftService } from "@/services/shift-service";
import {
  AuthUser,
  Shift,
  ShiftSyncEvent,
  SwapRequest,
  SwapRequestType,
  SwapStatus,
} from "@shiftsync/shared-types";
import {
  Clock,
  MapPin,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  Handshake,
  ArrowUpRight,
  CircleSlash,
} from "lucide-react";
import {
  format,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameDay,
  addWeeks,
  subWeeks,
} from "date-fns";
import { getRealtimeSocket } from "@/services/realtime-client";
import {
  formatTimeInTimeZone,
  getTimeZoneLabel,
  toDateKeyInTimeZone,
} from "@/lib/timezone";

export default function StaffSchedule() {
  const { user } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [dropBoard, setDropBoard] = useState<SwapRequestItem[]>([]);
  const [myRequests, setMyRequests] = useState<SwapRequestItem[]>([]);
  const [isUpdatingRequests, setIsUpdatingRequests] = useState(false);

  type SwapRequestItem = SwapRequest & {
    shift?: Shift;
    requester?: AuthUser;
    receiver?: AuthUser;
  };

  useEffect(() => {
    let isMounted = true;

    async function loadShifts() {
      try {
        const start = format(startOfWeek(currentDate), "yyyy-MM-dd");
        const end = format(endOfWeek(currentDate), "yyyy-MM-dd");
        const data = await shiftService.findAll("", start, end);

        if (isMounted) {
          setShifts(data.filter((s) => s.status === "PUBLISHED"));
        }
      } catch (error) {
        console.error("Failed to fetch shifts:", error);
      }
    }

    loadShifts();

    return () => {
      isMounted = false;
    };
  }, [currentDate]);

  useEffect(() => {
    let isMounted = true;

    const loadRequests = async () => {
      if (!user) return;

      setIsUpdatingRequests(true);
      try {
        const [board, mine] = await Promise.all([
          shiftService.listSwapRequests("drop-board"),
          shiftService.listSwapRequests(),
        ]);

        if (!isMounted) return;
        setDropBoard(board as SwapRequestItem[]);
        setMyRequests(mine as SwapRequestItem[]);
      } catch (error) {
        console.error("Failed to fetch swap/drop requests:", error);
      } finally {
        if (isMounted) {
          setIsUpdatingRequests(false);
        }
      }
    };

    loadRequests();

    return () => {
      isMounted = false;
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const socket = getRealtimeSocket();
    const refresh = async () => {
      const start = format(startOfWeek(currentDate), "yyyy-MM-dd");
      const end = format(endOfWeek(currentDate), "yyyy-MM-dd");
      const [schedule, board, mine] = await Promise.all([
        shiftService.findAll("", start, end),
        shiftService.listSwapRequests("drop-board"),
        shiftService.listSwapRequests(),
      ]);
      setShifts(schedule.filter((s) => s.status === "PUBLISHED"));
      setDropBoard(board as SwapRequestItem[]);
      setMyRequests(mine as SwapRequestItem[]);
    };

    user.certifiedLocations.forEach((locationId) => {
      socket.emit("join.location", { locationId });
    });

    const onStaffAssignmentUpdated = () => {
      refresh().catch((error) =>
        console.error("Failed to refresh shifts after live update:", error),
      );
    };
    const onSwapRequestUpdated = () => {
      refresh().catch((error) =>
        console.error(
          "Failed to refresh swap requests after live update:",
          error,
        ),
      );
    };
    const onShiftUpdated = () => {
      refresh().catch((error) =>
        console.error("Failed to refresh schedule after shift update:", error),
      );
    };
    const onSchedulePublished = () => {
      refresh().catch((error) =>
        console.error("Failed to refresh schedule after publish event:", error),
      );
    };

    socket.on(
      ShiftSyncEvent.STAFF_ASSIGNMENT_UPDATED,
      onStaffAssignmentUpdated,
    );
    socket.on(ShiftSyncEvent.SWAP_REQUEST_UPDATED, onSwapRequestUpdated);
    socket.on(ShiftSyncEvent.SHIFT_UPDATED, onShiftUpdated);
    socket.on(ShiftSyncEvent.SCHEDULE_PUBLISHED, onSchedulePublished);

    return () => {
      socket.off(
        ShiftSyncEvent.STAFF_ASSIGNMENT_UPDATED,
        onStaffAssignmentUpdated,
      );
      socket.off(ShiftSyncEvent.SWAP_REQUEST_UPDATED, onSwapRequestUpdated);
      socket.off(ShiftSyncEvent.SHIFT_UPDATED, onShiftUpdated);
      socket.off(ShiftSyncEvent.SCHEDULE_PUBLISHED, onSchedulePublished);
    };
  }, [user, currentDate]);

  const refreshRequests = async () => {
    const [board, mine] = await Promise.all([
      shiftService.listSwapRequests("drop-board"),
      shiftService.listSwapRequests(),
    ]);
    setDropBoard(board as SwapRequestItem[]);
    setMyRequests(mine as SwapRequestItem[]);
  };

  const handleDropRequest = async (shiftId: string) => {
    try {
      await shiftService.requestDrop(shiftId);
      await refreshRequests();
    } catch (error) {
      console.error("Failed to create drop request:", error);
    }
  };

  const handleSwapRequest = async (shiftId: string) => {
    const receiverId = window.prompt("Enter peer staff ID to request a swap:");
    if (!receiverId?.trim()) return;

    try {
      await shiftService.requestSwap(shiftId, receiverId.trim());
      await refreshRequests();
    } catch (error) {
      console.error("Failed to create swap request:", error);
    }
  };

  const handleClaimOrAccept = async (requestId: string) => {
    try {
      await shiftService.acceptSwapRequest(requestId);
      await refreshRequests();
    } catch (error) {
      console.error("Failed to accept/claim request:", error);
    }
  };

  const handleCancelRequest = async (requestId: string) => {
    try {
      await shiftService.cancelSwapRequest(requestId);
      await refreshRequests();
    } catch (error) {
      console.error("Failed to cancel request:", error);
    }
  };

  const weekDays = eachDayOfInterval({
    start: startOfWeek(currentDate),
    end: endOfWeek(currentDate),
  });

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">
            My Schedule
          </h1>
          <p className="text-gray-400">
            View your upcoming shifts and available assignments.
          </p>
        </div>
        <div className="flex items-center bg-[#141414] rounded-2xl p-1 border border-white/5 text-white">
          <button
            onClick={() => setCurrentDate(subWeeks(currentDate, 1))}
            className="p-2 hover:bg-[#0a0a0a] rounded-xl text-gray-400 transition-all"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="px-4 font-semibold text-sm">
            Week of {format(startOfWeek(currentDate), "MMM d")}
          </div>
          <button
            onClick={() => setCurrentDate(addWeeks(currentDate, 1))}
            className="p-2 hover:bg-[#0a0a0a] rounded-xl text-gray-400 transition-all"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {weekDays.map((day) => {
          const dayKey = format(day, "yyyy-MM-dd");
          const dayShifts = shifts.filter(
            (s) =>
              toDateKeyInTimeZone(
                s.startTime,
                s.location?.timezone ?? "UTC",
              ) === dayKey,
          );
          const isToday = isSameDay(day, new Date());

          return (
            <div
              key={day.toString()}
              className={`relative transition-all ${isToday ? "scale-[1.02] z-10" : ""}`}
            >
              <div
                className={`p-6 rounded-3xl border transition-all ${
                  isToday
                    ? "bg-indigo-600/10 border-indigo-500/30"
                    : "bg-[#141414] border-white/5 hover:border-white/10"
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div
                      className={`w-12 h-12 rounded-2xl flex flex-col items-center justify-center font-bold ${
                        isToday
                          ? "bg-indigo-600 text-white"
                          : "bg-[#0a0a0a] text-gray-400"
                      }`}
                    >
                      <span className="text-[10px] uppercase leading-none mb-1">
                        {format(day, "EEE")}
                      </span>
                      <span className="text-lg leading-none">
                        {format(day, "d")}
                      </span>
                    </div>
                    <div className="text-white">
                      <h3 className="font-semibold text-lg">
                        {dayShifts.length > 0
                          ? `${dayShifts.length} Shift(s)`
                          : "No shifts scheduled"}
                      </h3>
                      <p className="text-gray-500 text-sm">
                        {isToday
                          ? "Today's assignments"
                          : format(day, "MMMM do, yyyy")}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    {dayShifts.map((shift) => (
                      <div
                        key={shift.id}
                        className="bg-[#0a0a0a] border border-white/5 p-4 rounded-2xl flex flex-col gap-4 md:flex-row md:items-center md:justify-between"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center text-green-500">
                            <Clock size={20} />
                          </div>
                          <div className="text-white">
                            <div className="font-medium">
                              {formatTimeInTimeZone(
                                shift.startTime,
                                shift.location?.timezone ?? "UTC",
                              )}{" "}
                              -{" "}
                              {formatTimeInTimeZone(
                                shift.endTime,
                                shift.location?.timezone ?? "UTC",
                              )}{" "}
                              {getTimeZoneLabel(
                                shift.location?.timezone ?? "UTC",
                              )}
                            </div>
                            <div className="text-xs text-gray-500 flex items-center gap-1">
                              <Briefcase size={12} />
                              <span>{shift.requiredSkill}</span>
                              <span className="mx-1">•</span>
                              <MapPin size={12} />
                              <span>
                                {shift.location?.name ?? shift.locationId}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleDropRequest(shift.id)}
                            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-gray-100 hover:bg-white/10"
                          >
                            Offer Shift
                          </button>
                          <button
                            onClick={() => handleSwapRequest(shift.id)}
                            className="rounded-xl border border-indigo-500/40 bg-indigo-500/10 px-3 py-2 text-xs font-medium text-indigo-200 hover:bg-indigo-500/20"
                          >
                            Request Swap
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <section className="rounded-3xl border border-white/10 bg-[#141414] p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Shift Board</h2>
          {isUpdatingRequests && (
            <span className="text-xs text-gray-400">Refreshing...</span>
          )}
        </div>
        {dropBoard.length === 0 ? (
          <p className="text-sm text-gray-400">
            No open drop requests right now.
          </p>
        ) : (
          <ul className="space-y-3">
            {dropBoard.map((request) => (
              <li
                key={request.id}
                className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-gray-200 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <div className="font-medium">
                    {(request.shift?.requiredSkill as string) ?? "Shift"} •{" "}
                    {request.status}
                  </div>
                  <div className="text-xs text-gray-400">
                    Requested by{" "}
                    {request.requester?.name ?? request.requesterId}
                  </div>
                </div>
                <button
                  onClick={() => handleClaimOrAccept(request.id)}
                  className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-500/20"
                >
                  <Handshake size={14} />
                  Claim Shift
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-3xl border border-white/10 bg-[#141414] p-6">
        <h2 className="mb-4 text-lg font-semibold text-white">My Requests</h2>
        {myRequests.length === 0 ? (
          <p className="text-sm text-gray-400">No active swap/drop requests.</p>
        ) : (
          <ul className="space-y-3">
            {myRequests.map((request) => (
              <li
                key={request.id}
                className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-gray-200 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <div className="font-medium">
                    {request.type === SwapRequestType.SWAP ? "Swap" : "Drop"} •{" "}
                    {request.status}
                  </div>
                  <div className="text-xs text-gray-400">
                    {request.type === SwapRequestType.SWAP ? (
                      <span className="inline-flex items-center gap-1">
                        <ArrowUpRight size={12} />
                        Peer:{" "}
                        {request.receiver?.name ?? request.receiverId ?? "TBD"}
                      </span>
                    ) : (
                      <span>Shift available for claim</span>
                    )}
                  </div>
                </div>
                {request.status === SwapStatus.PENDING ||
                request.status === SwapStatus.ACCEPTED_BY_PEER ? (
                  <button
                    onClick={() => handleCancelRequest(request.id)}
                    className="inline-flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-200 hover:bg-rose-500/20"
                  >
                    <CircleSlash size={14} />
                    Cancel
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
