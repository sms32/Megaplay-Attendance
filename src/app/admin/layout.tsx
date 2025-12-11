// app/admin/layout.tsx
'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { isAdmin } from '@/lib/utils/adminCheck';
import Image from 'next/image';

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    await signOut();
    router.replace('/login');
  };

  // Centered loading while auth is resolving
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#02030a] text-slate-50">
        <div className="w-full max-w-xs rounded-3xl bg-[radial-gradient(circle_at_top,#111827,#020617)] border border-white/10 shadow-[0_24px_120px_rgba(0,0,0,0.9)] px-8 py-10 text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-slate-500 border-t-white mx-auto mb-4" />
          <p className="text-sm text-slate-100">Checking access…</p>
        </div>
      </div>
    );
  }

  // If not admin, render nothing (page hook will redirect)
  if (!user || !isAdmin(user.email)) {
    return null;
  }

  const navItems = [
    { href: '/admin', label: 'Manage Coordinators' },
    { href: '/admin/students', label: 'Students' },
    { href: '/admin/attendance', label: 'Reports' },
    { href: '/admin/sessions', label: 'Sessions' },
    { href: '/admin/bulk-fetch', label: 'Search' },
    { href: '/admin/all', label: 'Search All' },
  ];

  return (
    <div className="min-h-screen bg-[#02030a] relative overflow-hidden text-slate-50">
      {/* Background gradients */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at center, rgba(30,64,175,0.45) 0%, rgba(15,23,42,0.9) 35%, rgba(3,7,18,1) 70%)',
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(148,163,184,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.14) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Glass Header */}
        <header className="sticky top-0 z-20 border-b border-white/10 bg-black/40 backdrop-blur-2xl px-4 sm:px-8 lg:px-12 py-4 flex items-center justify-between shadow-[0_10px_40px_rgba(0,0,0,0.7)]">
          <div className="flex items-center gap-4 sm:gap-6">
            <div className="w-10 h-10 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center overflow-hidden">
              <Image
                src="/klo2.svg"
                alt="MegaPlay logo"
                width={32}
                height={32}
                className="w-8 h-8 object-contain"
                priority
              />
            </div>
            <div className="flex flex-col mr-2">
              <span className="text-sm font-semibold text-slate-100">
                Admin • MegaPlay
              </span>
              <span className="text-[11px] text-slate-400">
                Attendance Control Panel
              </span>
            </div>

            {/* Desktop nav pills */}
            <nav className="hidden md:flex items-center gap-1 text-xs sm:text-sm ml-2">
              {navItems.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-3 py-1.5 rounded-2xl transition-all ${
                      active
                        ? 'bg-white/90 text-slate-900 shadow-[0_8px_28px_rgba(15,23,42,0.9)]'
                        : 'text-slate-200/90 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-3 text-[11px] sm:text-xs">
            <span className="hidden sm:block text-slate-300 max-w-[200px] truncate">
              {user.email}
            </span>
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 rounded-full bg-white/5 border border-white/20 text-slate-100 hover:bg-white/10 hover:border-white/30 transition-colors"
            >
              Logout
            </button>
          </div>
        </header>

        {/* Mobile nav pills */}
        <nav className="md:hidden px-4 pt-3 pb-2 border-b border-white/10 bg-black/40 backdrop-blur-2xl flex gap-2 overflow-x-auto text-xs">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-1.5 rounded-2xl whitespace-nowrap transition-all ${
                  active
                    ? 'bg-white/90 text-slate-900 shadow-[0_6px_20px_rgba(15,23,42,0.9)]'
                    : 'text-slate-200/90 hover:text-white hover:bg-white/10'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Main content – page decides its own cards */}
        <main className="flex-1 px-4 sm:px-8 lg:px-16 py-8">
          <div className="max-w-6xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}
