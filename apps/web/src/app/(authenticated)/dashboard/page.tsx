'use client';

import { useAuth } from '@/context/auth-context';
import { LayoutDashboard, Users, Calendar, TrendingUp } from 'lucide-react';

export default function DashboardPage() {
  const { user } = useAuth();

  const stats = [
    { label: 'Active Staff', value: '12', icon: Users, color: 'text-blue-400' },
    { label: 'Open Shifts', value: '4', icon: Calendar, color: 'text-amber-400' },
    { label: 'Efficiency', value: '94%', icon: TrendingUp, color: 'text-emerald-400' },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
          <LayoutDashboard className="text-indigo-500" size={32} />
          {user?.role === 'ADMIN' ? 'Admin Control' : 'Manager Dashboard'}
        </h1>
        <p className="text-gray-400 mt-2">Welcome back, {user?.name}. Here&apos;s what&apos;s happening across your locations.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-[#141414] border border-white/5 p-6 rounded-2xl shadow-xl hover:border-indigo-500/30 transition-all group">
            <div className="flex justify-between items-start mb-4">
              <div className={`p-3 rounded-xl bg-white/5 ${stat.color} group-hover:scale-110 transition-transform`}>
                <stat.icon size={24} />
              </div>
            </div>
            <p className="text-gray-500 text-sm font-medium">{stat.label}</p>
            <p className="text-2xl font-bold text-white mt-1">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[#141414] border border-white/5 rounded-2xl p-8 flex flex-col items-center justify-center min-h-[300px] text-center">
        <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
          <LayoutDashboard className="text-gray-600" size={32} />
        </div>
        <h2 className="text-xl font-semibold text-white">Full Dashboard Coming Soon</h2>
        <p className="text-gray-500 mt-2 max-w-md">We&apos;re currently building out the deep statistics and live location tracking for your dashboard.</p>
      </div>
    </div>
  );
}
