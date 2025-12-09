// app/admin/layout.tsx
'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/app/context/AuthContext';
import { isAdmin } from '@/lib/utils/adminCheck';

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    await signOut();
    router.replace('/login');
  };

  // While auth not ready or not admin, hide admin shell
  if (!user || !isAdmin(user.email)) {
    return null;
  }

  const navItems = [
    { href: '/admin', label: 'Manage Coordinators' },
    { href: '/admin/students', label: 'Students' },
    { href: '/admin/attendance', label: 'Reports' },
    { href: '/admin/sessions', label: 'Sessions' },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <span className="font-semibold text-amber-400">
            Admin – Attendance CMS
          </span>
          <nav className="flex items-center gap-4 text-sm">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`px-2 py-1 rounded ${
                  pathname === item.href
                    ? 'bg-slate-800 text-amber-300'
                    : 'text-slate-300 hover:text-amber-300'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-slate-300">{user.email}</span>
          <button
            onClick={handleLogout}
            className="px-3 py-1.5 rounded-md bg-slate-800 border border-slate-600 hover:bg-slate-700"
          >
            Logout
          </button>
        </div>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
