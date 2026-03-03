"use client";

import React from "react";
import { Shift } from "@shiftsync/shared-types";
import {
  format,
  eachDayOfInterval,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  isSameDay,
} from "date-fns";
import { Plus } from "lucide-react";
import ShiftCard from "./shift-card";
import { toDateKeyInTimeZone } from "@/lib/timezone";

interface CalendarGridProps {
  currentDate: Date;
  shifts: Shift[];
  onDayClick: (date: Date) => void;
  onShiftClick: (shift: Shift) => void;
  isLoading: boolean;
  timeZone: string;
}

export default function CalendarGrid({
  currentDate,
  shifts,
  onDayClick,
  onShiftClick,
  isLoading,
  timeZone,
}: CalendarGridProps) {
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(currentDate)),
    end: endOfWeek(endOfMonth(currentDate)),
  });

  return (
    <div className="bg-[#141111] border border-white/5 rounded-[2.5rem] overflow-hidden shadow-2xl overflow-x-auto relative">
      {isLoading && (
        <div className="absolute inset-0 z-10 bg-[#0a0a0a]/40 backdrop-blur-[2px] flex items-center justify-center">
          <div className="w-10 h-10 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
        </div>
      )}

      <div className="grid grid-cols-7 min-w-[1000px] text-white">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <div
            key={day}
            className="py-6 text-center bg-[#0d0d0d]/80 text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 border-b border-white/5"
          >
            {day}
          </div>
        ))}

        {days.map((day) => {
          const dayKey = toDateKeyInTimeZone(day, timeZone);
          const dayShifts = shifts.filter(
            (s) => toDateKeyInTimeZone(s.startTime, timeZone) === dayKey,
          );
          const isToday = isSameDay(day, new Date());
          const isPast = day < new Date() && !isToday;
          const isCurrentMonth = day.getMonth() === currentDate.getMonth();

          return (
            <div
              key={day.toString()}
              className={`
                min-h-[180px] p-4 border-r border-b border-white/5 transition-all group relative
                ${!isCurrentMonth ? "bg-[#0a0a0a]/30 opacity-40" : isPast ? "bg-[#0a0a0a]/50" : "hover:bg-white/[0.01]"}
              `}
            >
              <div className="flex justify-between items-start mb-4">
                <span
                  className={`
                  text-sm font-bold flex items-center justify-center w-8 h-8 rounded-2xl transition-all
                  ${
                    isToday
                      ? "bg-indigo-600 text-white shadow-[0_0_20px_rgba(79,70,229,0.5)] scale-110"
                      : isCurrentMonth
                        ? "text-gray-300"
                        : "text-gray-600"
                  }
                `}
                >
                  {format(day, "d")}
                </span>
                {!isPast && isCurrentMonth && (
                  <button
                    onClick={() => onDayClick(day)}
                    className="opacity-0 group-hover:opacity-100 p-2 bg-white/5 hover:bg-white/10 rounded-xl text-gray-400 transition-all hover:scale-110 active:scale-95"
                  >
                    <Plus size={16} />
                  </button>
                )}
              </div>

              <div className="space-y-2">
                {dayShifts.map((shift) => (
                  <ShiftCard
                    key={shift.id}
                    shift={shift}
                    onClick={onShiftClick}
                    timeZone={timeZone}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
