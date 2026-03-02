"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/auth-context";
import { shiftService } from "@/services/shift-service";
import { Shift, ShiftSyncEvent } from "@shiftsync/shared-types";
import {
  Clock,
  MapPin,
  Briefcase,
  ChevronLeft,
  ChevronRight,
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

export default function StaffSchedule() {
  const { user } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [shifts, setShifts] = useState<Shift[]>([]);

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
    if (!user) return;

    const socket = getRealtimeSocket();
    const refresh = async () => {
      const start = format(startOfWeek(currentDate), "yyyy-MM-dd");
      const end = format(endOfWeek(currentDate), "yyyy-MM-dd");
      const data = await shiftService.findAll("", start, end);
      setShifts(data.filter((s) => s.status === "PUBLISHED"));
    };

    user.certifiedLocations.forEach((locationId) => {
      socket.emit("join.location", { locationId });
    });

    const onStaffAssignmentUpdated = () => {
      refresh().catch((error) =>
        console.error("Failed to refresh shifts after live update:", error),
      );
    };

    socket.on(
      ShiftSyncEvent.STAFF_ASSIGNMENT_UPDATED,
      onStaffAssignmentUpdated,
    );

    return () => {
      socket.off(
        ShiftSyncEvent.STAFF_ASSIGNMENT_UPDATED,
        onStaffAssignmentUpdated,
      );
    };
  }, [user, currentDate]);

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
          const dayShifts = shifts.filter((s) =>
            isSameDay(new Date(s.startTime), day),
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
                        className="bg-[#0a0a0a] border border-white/5 p-4 rounded-2xl flex items-center justify-between gap-10"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center text-green-500">
                            <Clock size={20} />
                          </div>
                          <div className="text-white">
                            <div className="font-medium">
                              {format(new Date(shift.startTime), "HH:mm")} -{" "}
                              {format(new Date(shift.endTime), "HH:mm")}
                            </div>
                            <div className="text-xs text-gray-500 flex items-center gap-1">
                              <Briefcase size={12} />
                              <span>{shift.requiredSkill}</span>
                              <span className="mx-1">•</span>
                              <MapPin size={12} />
                              <span>{shift.locationId}</span>
                            </div>
                          </div>
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
    </div>
  );
}
