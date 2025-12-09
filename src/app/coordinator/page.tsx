// app/coordinator/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/app/context/AuthContext';
import { useRouter } from 'next/navigation';
import { isAdmin } from '@/lib/utils/adminCheck';
import { isCoordinatorEmail } from '@/lib/services/coordinatorService';

export default function CoordinatorPage() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const [checkingAccess, setCheckingAccess] = useState(true);

  // Route guard: only coordinators (non-admins)
  useEffect(() => {
    const checkAccess = async () => {
      if (!loading) {
        if (!user) {
          router.replace('/login');
          return;
        }

        // If admin, redirect to admin page
        if (isAdmin(user.email)) {
          router.replace('/admin');
          return;
        }

        // Check if coordinator
        try {
          const allowed = await isCoordinatorEmail(user.email!);
          if (!allowed) {
            router.replace('/login');
            return;
          }
        } catch (e) {
          console.error('Access check failed:', e);
          router.replace('/login');
          return;
        }

        setCheckingAccess(false);
      }
    };

    checkAccess();
  }, [loading, user, router]);

  const handleLogout = async () => {
    await signOut();
    router.replace('/login');
  };

  if (loading || checkingAccess || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto mb-4"></div>
          <p className="text-lg">Checking access...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <span className="font-semibold text-amber-400">
            Coordinator Portal – Attendance CMS
          </span>
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

      {/* Main Content */}
      <main className="p-6 max-w-7xl mx-auto">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-100 mb-2">
            Welcome, {user.displayName || 'Coordinator'}
          </h1>
          <p className="text-slate-400">
            Select an attendance category to start marking
          </p>
        </div>

        {/* Category Selection Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          {/* OD / Scholarship Card */}
          <div
            className="bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700 rounded-xl p-8 shadow-xl hover:shadow-2xl transition-all duration-300 cursor-pointer group"
            onClick={() => router.push('/coordinator/od-scholarship')}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 bg-amber-500/20 rounded-lg group-hover:bg-amber-500/30 transition-colors">
                <svg
                  className="w-8 h-8 text-amber-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <svg
                className="w-6 h-6 text-slate-600 group-hover:text-amber-400 transition-colors"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-semibold text-slate-100 mb-2">
              OD / Scholarship
            </h2>
            <p className="text-slate-400 text-sm">
              Mark attendance for students with On Duty or Scholarship status
            </p>
          </div>

          {/* Lab Card */}
          <div
            className="bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700 rounded-xl p-8 shadow-xl hover:shadow-2xl transition-all duration-300 cursor-pointer group"
            onClick={() => router.push('/coordinator/lab')}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 bg-emerald-500/20 rounded-lg group-hover:bg-emerald-500/30 transition-colors">
                <svg
                  className="w-8 h-8 text-emerald-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
                  />
                </svg>
              </div>
              <svg
                className="w-6 h-6 text-slate-600 group-hover:text-emerald-400 transition-colors"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-semibold text-slate-100 mb-2">Lab</h2>
            <p className="text-slate-400 text-sm">
              Mark attendance for students attending lab sessions
            </p>
          </div>
        </div>

        {/* Info Section */}
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-slate-100 mb-4">
            Quick Instructions
          </h3>
          <ul className="space-y-2 text-sm text-slate-400">
            <li className="flex items-start gap-2">
              <span className="text-amber-400 mt-0.5">•</span>
              <span>Select a category above to start marking attendance</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-400 mt-0.5">•</span>
              <span>
                Scan student ID barcodes or manually enter register numbers
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-400 mt-0.5">•</span>
              <span>
                Student details will be fetched automatically and displayed in
                real-time
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-400 mt-0.5">•</span>
              <span>
                All attendance records are saved automatically under your account
              </span>
            </li>
          </ul>
        </div>
      </main>
    </div>
  );
}
