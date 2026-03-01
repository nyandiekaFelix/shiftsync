'use client';

import { useAuth } from '@/context/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Loader2, LogOut, User as UserIcon } from 'lucide-react';

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
        <Loader2 className="animate-spin text-indigo-600" size={40} />
      </div>
    );
  }

  const roleStyles = {
    ADMIN: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    MANAGER: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    STAFF: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <header className="border-b border-white/5 bg-[#141414]/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">S</span>
            </div>
            <span className="text-xl font-bold text-white tracking-tight">ShiftSync</span>
            <span className={`ml-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full border ${roleStyles[user.role]}`}>
              {user.role}
            </span>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3 pr-6 border-r border-white/5">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-white">{user.name}</p>
                <p className="text-[11px] text-gray-500">{user.email}</p>
              </div>
              <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-full flex items-center justify-center border border-white/10 shadow-lg">
                <UserIcon size={18} className="text-white" />
              </div>
            </div>

            <button
              onClick={() => logout()}
              className="group flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm font-medium"
            >
              <LogOut size={18} className="group-hover:translate-x-0.5 transition-transform" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
        {children}
      </main>
    </div>
  );
}
