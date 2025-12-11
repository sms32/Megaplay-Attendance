// app/coordinator/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { isAdmin } from '@/lib/utils/adminCheck';
import { isCoordinatorEmail } from '@/lib/services/coordinatorService';
import Image from 'next/image';

// Shared background shell (matches landing/login)
function BackgroundShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#02030a] relative overflow-hidden">
      {/* Vignette / color glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at center, rgba(30,64,175,0.45) 0%, rgba(15,23,42,0.9) 35%, rgba(3,7,18,1) 70%)',
        }}
      />
      {/* Subtle grid */}
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(148,163,184,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.14) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />
      {/* Blobs */}
      <AnimatedBlobs />
      <div className="relative z-10 min-h-screen flex flex-col">
        {children}
      </div>
    </div>
  );
}

function AnimatedBlobs() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div
        className="absolute -left-40 top-10 w-[520px] h-[520px] rounded-[60%] opacity-35"
        style={{
          background:
            'radial-gradient(circle at 30% 30%, rgba(59,130,246,0.7) 0%, transparent 60%)',
          filter: 'blur(90px)',
        }}
      />
      <div
        className="absolute right-[-120px] bottom-[-40px] w-[620px] h-[620px] rounded-[60%] opacity-45"
        style={{
          background:
            'radial-gradient(circle at 70% 60%, rgba(147,51,234,0.9) 0%, transparent 65%)',
          filter: 'blur(110px)',
        }}
      />
    </div>
  );
}

export default function CoordinatorPage() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const [checkingAccess, setCheckingAccess] = useState(true);

  // Route guard: only coordinators (non-admins)
  useEffect(() => {
    const checkAccess = async () => {
      if (loading) return;

      if (!user) {
        router.replace('/login');
        return;
      }

      if (isAdmin(user.email)) {
        router.replace('/admin');
        return;
      }

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
    };

    checkAccess();
  }, [loading, user, router]);

  const handleLogout = async () => {
    await signOut();
    router.replace('/login');
  };

  if (loading || checkingAccess || !user) {
    return (
      <BackgroundShell>
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="w-full max-w-xs rounded-3xl bg-[radial-gradient(circle_at_top,#111827,#020617)] border border-white/10 shadow-[0_24px_120px_rgba(0,0,0,0.9)] px-8 py-10 text-center animate-[fadeInUp_0.7s_ease-out_forwards] opacity-0">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-slate-500 border-t-white mx-auto mb-4" />
            <p className="text-sm text-slate-100">Checking access…</p>
          </div>
        </div>
      </BackgroundShell>
    );
  }

  return (
    <BackgroundShell>
      {/* Glass header */}
      <header className="sticky top-0 z-20 border-b border-white/10 bg-black/30 backdrop-blur-2xl px-6 sm:px-10 py-4 flex items-center justify-between shadow-[0_10px_40px_rgba(0,0,0,0.7)]">
        <div className="flex items-center gap-3">
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


          <div className="flex flex-col">
            <span className="text-sm font-semibold text-slate-100">
              Coordinator Portal
            </span>
            <span className="text-[11px] text-slate-400">
              MegaPlay Attendance 
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-200/90">
            Coordinator
          </span>
          <span className="hidden sm:block text-slate-300 max-w-[180px] truncate">
            {user.email}
          </span>
          <button
            onClick={handleLogout}
            className="px-3 py-1.5 rounded-full bg-white/5 border border-white/20 text-[11px] text-slate-100 hover:bg-white/10 hover:border-white/30 transition-colors"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 px-4 sm:px-8 lg:px-16 py-8">
        <div className="max-w-6xl mx-auto space-y-8">
          {/* Welcome */}
          <section className="flex flex-col gap-2 animate-[fadeInUp_0.7s_ease-out_forwards] opacity-0">
            <h1 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight">
              Welcome, {user.displayName || 'Coordinator'}
            </h1>
            <p className="text-sm sm:text-base text-slate-300/90">
              Choose an attendance category to start marking records.
            </p>
          </section>

          {/* Category cards */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8 animate-[fadeInUp_0.7s_ease-out_0.05s_forwards] opacity-0">
            {/* OD / Scholarship Card */}
            <button
              type="button"
              onClick={() => router.push('/coordinator/od-scholarship')}
              className="group relative text-left rounded-3xl bg-white/5 border border-white/15 backdrop-blur-2xl px-7 py-7 sm:px-8 sm:py-8 shadow-[0_18px_60px_rgba(0,0,0,0.85)] hover:shadow-[0_26px_90px_rgba(0,0,0,1)] transition-all duration-300 hover:-translate-y-1 cursor-pointer overflow-hidden"
            >
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.16),transparent_60%)]" />
              <div className="relative flex items-start justify-between mb-4">
                <div className="p-3 rounded-2xl bg-amber-500/15 border border-amber-300/30 group-hover:bg-amber-500/25 transition-colors">
                  <svg
                    className="w-7 h-7 text-amber-300"
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
                  className="w-5 h-5 text-slate-500 group-hover:text-amber-300 transition-colors"
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
              <h2 className="relative text-lg sm:text-xl font-semibold text-slate-50 mb-2">
                OD / Scholarship
              </h2>
              <p className="relative text-xs sm:text-sm text-slate-300/90 leading-relaxed">
                Mark attendance for students with On Duty or Scholarship status.
              </p>
            </button>

            {/* Lab Card */}
            <button
              type="button"
              onClick={() => router.push('/coordinator/lab')}
              className="group relative text-left rounded-3xl bg-white/5 border border-white/15 backdrop-blur-2xl px-7 py-7 sm:px-8 sm:py-8 shadow-[0_18px_60px_rgba(0,0,0,0.85)] hover:shadow-[0_26px_90px_rgba(0,0,0,1)] transition-all duration-300 hover:-translate-y-1 cursor-pointer overflow-hidden"
            >
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none bg-[radial-gradient(circle_at_top,rgba(52,211,153,0.16),transparent_60%)]" />
              <div className="relative flex items-start justify-between mb-4">
                <div className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-300/30 group-hover:bg-emerald-500/25 transition-colors">
                  <svg
                    className="w-7 h-7 text-emerald-300"
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
                  className="w-5 h-5 text-slate-500 group-hover:text-emerald-300 transition-colors"
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
              <h2 className="relative text-lg sm:text-xl font-semibold text-slate-50 mb-2">
                Lab
              </h2>
              <p className="relative text-xs sm:text-sm text-slate-300/90 leading-relaxed">
                Mark attendance for students attending lab sessions.
              </p>
            </button>
          </section>

          {/* Info Section */}
          <section className="rounded-3xl bg-white/5 border border-white/15 backdrop-blur-2xl px-6 sm:px-8 py-6 sm:py-7 shadow-[0_18px_60px_rgba(0,0,0,0.85)] animate-[fadeInUp_0.7s_ease-out_0.1s_forwards] opacity-0">
            <h3 className="text-sm sm:text-base font-semibold text-slate-50 mb-4">
              Quick Instructions
            </h3>
            <ul className="space-y-2 text-xs sm:text-sm text-slate-300/90">
              <li className="flex items-start gap-2">
                <span className="text-amber-400 mt-0.5">•</span>
                <span>Select a category above to start marking attendance.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-400 mt-0.5">•</span>
                <span>
                  Scan student ID barcodes or manually enter register numbers.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-400 mt-0.5">•</span>
                <span>
                  Student details will be fetched automatically and displayed in
                  real time.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-400 mt-0.5">•</span>
                <span>
                  All attendance records are saved automatically under your
                  account.
                </span>
              </li>
            </ul>
          </section>
        </div>
      </main>

      <style jsx global>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(40px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </BackgroundShell>
  );
}
