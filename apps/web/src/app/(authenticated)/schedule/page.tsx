'use client';

import { useAuth } from '@/context/auth-context';
import { Calendar, Clock, MapPin } from 'lucide-react';

export default function SchedulePage() {
  const { user } = useAuth();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
          <Calendar className="text-emerald-500" size={32} />
          My Schedule
        </h1>
        <p className="text-gray-400 mt-2">Hello, {user?.name}. Review your upcoming shifts and availability.</p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <div className="bg-[#141414] border border-white/5 rounded-2xl p-8 flex flex-col items-center justify-center min-h-[400px] text-center">
          <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
            <Clock className="text-gray-600" size={32} />
          </div>
          <h2 className="text-xl font-semibold text-white">Interactive Schedule Coming Soon</h2>
          <p className="text-gray-500 mt-2 max-w-md">The drag-and-drop schedule and shift swap features are currently under development.</p>

          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-lg">
            <div className="bg-[#1a1a1a] p-4 rounded-xl border border-white/5 text-left">
              <div className="flex items-center gap-2 text-emerald-400 mb-1">
                <Clock size={14} />
                <span className="text-xs font-bold uppercase tracking-wider">Next Shift</span>
              </div>
              <p className="text-white font-medium">Tomorrow, 9:00 AM</p>
              <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                <MapPin size={10} />
                Seattle North
              </p>
            </div>
            <div className="bg-[#1a1a1a] p-4 rounded-xl border border-white/5 text-left">
              <div className="flex items-center gap-2 text-blue-400 mb-1">
                <Calendar size={14} />
                <span className="text-xs font-bold uppercase tracking-wider">Status</span>
              </div>
              <p className="text-white font-medium">Fully Available</p>
              <p className="text-xs text-gray-500 mt-1">Next 7 days</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
