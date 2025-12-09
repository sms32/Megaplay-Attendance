// app/coordinator/od-scholarship/page.tsx
'use client';

import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/app/context/AuthContext';
import { useRouter } from 'next/navigation';
import { isAdmin } from '@/lib/utils/adminCheck';
import { isCoordinatorEmail } from '@/lib/services/coordinatorService';
import {
  markAttendanceFast,
  getSessionAttendance,
  preloadSessionCache,
  clearSessionCache,
  deleteAttendanceRecord,
  findExistingAttendance,
  updateAttendanceCategory,
  AttendanceRecord,
} from '@/lib/services/attendanceService';
import { getStudentCached } from '@/lib/services/studentCache';
import { getSessionConfig, SessionConfig } from '@/lib/services/sessionService';
import Image from 'next/image';

const formatDateKey = (d: Date) => d.toISOString().split('T')[0];

// Shared background shell to match landing/login/coordinator
function BackgroundShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#02030a] relative overflow-hidden">
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
      <AnimatedBlobs />
      <div className="relative z-10 min-h-screen flex flex-col">{children}</div>
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

export default function ODScholarshipAttendancePage() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [checkingAccess, setCheckingAccess] = useState(true);

  // Date & Session Selection
  const [dateKey, setDateKey] = useState(formatDateKey(new Date()));
  const [sessionConfig, setSessionConfig] = useState<SessionConfig | null>(null);
  const [selectedSessionIndex, setSelectedSessionIndex] = useState<number | null>(null);
  const [sessionReady, setSessionReady] = useState(false);

  // Scanning State
  const [regNoInput, setRegNoInput] = useState('');
  const [processing, setProcessing] = useState(false);
  const [sessionAttendance, setSessionAttendance] = useState<AttendanceRecord[]>([]);
  const [lastScanned, setLastScanned] = useState<AttendanceRecord | null>(null);
  const [error, setError] = useState('');
  const [stats, setStats] = useState({ total: 0, od: 0, scholarship: 0 });

  // Delete state
  const [deleting, setDeleting] = useState<string | null>(null);

  // Route guard
  useEffect(() => {
    const checkAccess = async () => {
      if (!loading) {
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
      }
    };

    checkAccess();
  }, [loading, user, router]);

  // Load session config when date changes
  useEffect(() => {
    const loadSessionConfig = async () => {
      if (!dateKey) return;

      const config = await getSessionConfig(dateKey);
      setSessionConfig(config);
      setSelectedSessionIndex(null);
      setSessionReady(false);
      setSessionAttendance([]);
      setStats({ total: 0, od: 0, scholarship: 0 });
    };

    loadSessionConfig();
  }, [dateKey]);

  // Load BOTH OD and Scholarship attendance
  useEffect(() => {
    const loadAttendance = async () => {
      if (!user || !sessionReady || selectedSessionIndex === null) return;

      const sessionId = `${dateKey}-session-${selectedSessionIndex}`;

      try {
        const odRecords = await getSessionAttendance(user.uid, 'od', sessionId);
        const scholarshipRecords = await getSessionAttendance(user.uid, 'scholarship', sessionId);

        const allRecords = [...odRecords, ...scholarshipRecords];

        allRecords.sort((a, b) => {
          const timeA = a.timestamp?.seconds
            ? a.timestamp.seconds * 1000
            : new Date(a.timestamp).getTime();
          const timeB = b.timestamp?.seconds
            ? b.timestamp.seconds * 1000
            : new Date(b.timestamp).getTime();
          return timeB - timeA;
        });

        setSessionAttendance(allRecords);

        const odCount = allRecords.filter((r) => r.category === 'od').length;
        const scholarshipCount = allRecords.filter((r) => r.category === 'scholarship').length;
        setStats({
          total: allRecords.length,
          od: odCount,
          scholarship: scholarshipCount,
        });
      } catch (e) {
        console.error('Failed to load attendance:', e);
      }
    };

    loadAttendance();
  }, [sessionReady, selectedSessionIndex, dateKey, user]);

  // Auto-focus input when ready
  useEffect(() => {
    if (inputRef.current && sessionReady && !processing) {
      inputRef.current.focus();
    }
  }, [sessionReady, processing, sessionAttendance]);

  // Start session with cache preloading
  const handleStartSession = async () => {
    if (selectedSessionIndex === null) {
      setError('Please select a session first');
      return;
    }

    setError('');
    setSessionReady(true);

    const sessionId = `${dateKey}-session-${selectedSessionIndex}`;
    if (user) {
      preloadSessionCache(user.uid, 'od', sessionId).catch((e) =>
        console.error('Cache preload failed:', e),
      );
      preloadSessionCache(user.uid, 'scholarship', sessionId).catch((e) =>
        console.error('Scholarship cache preload failed:', e),
      );
    }
  };

  // Scan handler with duplicate/category checks
  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();

    const regNo = regNoInput.trim().toUpperCase();
    if (!regNo || processing || selectedSessionIndex === null) return;

    setProcessing(true);
    setError('');
    setLastScanned(null);

    try {
      const sessionId = `${dateKey}-session-${selectedSessionIndex}`;
      const sessionName =
        sessionConfig?.sessionNames[selectedSessionIndex] || `Session ${selectedSessionIndex + 1}`;

      const student = await getStudentCached(regNo);

      if (!student) {
        setError(`❌ Student ${regNo} not found in database`);
        setRegNoInput('');
        setProcessing(false);
        return;
      }

      const hasOD = student.categories?.od === true;
      const hasScholarship = student.categories?.scholarship === true;

      if (!hasOD && !hasScholarship) {
        setError(
          `⚠️ ${student.name} (${regNo}) is not registered for OD or Scholarship`,
        );
        setRegNoInput('');
        setProcessing(false);
        return;
      }

      const category: 'od' | 'scholarship' = hasOD ? 'od' : 'scholarship';

      const existing = await findExistingAttendance(regNo, sessionId);

      if (existing) {
        if (existing.category === category) {
          setError(
            `⚠️ ${student.name} (${regNo}) is already marked as ${category.toUpperCase()} for ${sessionName}`,
          );
          setRegNoInput('');
          setProcessing(false);
          return;
        } else {
          const confirmed = confirm(
            `${student.name} (${regNo}) is already marked as ${existing.category.toUpperCase()} for this session.\n\nDo you want to change it to ${category.toUpperCase()}?`,
          );

          if (!confirmed || !existing.id) {
            setRegNoInput('');
            setProcessing(false);
            return;
          }

          await updateAttendanceCategory(existing.id, category, user!.uid, user!.email!);

          setSessionAttendance((prev) =>
            prev.map((r) => (r.id === existing.id ? { ...r, category } : r)),
          );

          setStats((prev) => {
            const newStats = { ...prev };
            if (existing.category === 'od') newStats.od--;
            if (existing.category === 'scholarship') newStats.scholarship--;
            newStats[category]++;
            return newStats;
          });

          const updated: AttendanceRecord = { ...existing, category };
          setLastScanned(updated);
          setRegNoInput('');
          setProcessing(false);
          return;
        }
      }

      const record = await markAttendanceFast(
        student,
        category,
        user!.uid,
        user!.email!,
        dateKey,
        selectedSessionIndex,
        sessionName,
      );

      setSessionAttendance((prev) => [record, ...prev]);
      setLastScanned(record);
      setStats((prev) => ({
        ...prev,
        total: prev.total + 1,
        [category]: prev[category] + 1,
      }));
    } catch (err) {
      console.error('Scan error:', err);
      setError(`❌ Failed to mark attendance: ${err}`);
    } finally {
      setRegNoInput('');
      setProcessing(false);
    }
  };

  // Delete attendance record
  const handleDelete = async (record: AttendanceRecord) => {
    if (!record.id) return;

    const confirmed = confirm(
      `Delete attendance for ${record.studentName} (${record.regNo})?\n\nThis action cannot be undone.`,
    );

    if (!confirmed) return;

    setDeleting(record.id);

    try {
      const sessionId = `${dateKey}-session-${selectedSessionIndex!}`;

      await deleteAttendanceRecord(record.id, record.regNo, record.category, sessionId);

      setSessionAttendance((prev) => prev.filter((r) => r.id !== record.id));

      setStats((prev) => ({
        ...prev,
        total: prev.total - 1,
        od: prev.od - (record.category === 'od' ? 1 : 0),
        scholarship:
          prev.scholarship - (record.category === 'scholarship' ? 1 : 0),
      }));
    } catch (err) {
      console.error('Delete error:', err);
      setError(`❌ Failed to delete: ${err}`);
    } finally {
      setDeleting(null);
    }
  };

  // Clear cache when changing sessions
  const handleChangeSession = () => {
    if (selectedSessionIndex !== null) {
      const sessionId = `${dateKey}-session-${selectedSessionIndex}`;
      clearSessionCache(sessionId);
    }
    setSessionReady(false);
    setSessionAttendance([]);
    setStats({ total: 0, od: 0, scholarship: 0 });
  };

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
            <p className="text-sm text-slate-100">Loading…</p>
          </div>
        </div>
      </BackgroundShell>
    );
  }

  return (
    <BackgroundShell>
      {/* Header matching coordinator page with logo */}
      <header className="sticky top-0 z-20 border-b border-white/10 bg-black/30 backdrop-blur-2xl px-6 sm:px-10 py-4 flex items-center justify-between shadow-[0_10px_40px_rgba(0,0,0,0.7)]">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/coordinator')}
            className="text-slate-300 hover:text-amber-300 text-xs sm:text-sm flex items-center gap-1"
          >
            <span>←</span>
            <span className="hidden sm:inline">Back</span>
          </button>
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
          <div className="flex flex-col ml-1">
            <span className="text-sm font-semibold text-slate-100">
              OD / Scholarship Attendance
            </span>
            <span className="text-[11px] text-slate-400">
              MegaPlay Coordinator • {dateKey}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs">
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

      <main className="flex-1 px-4 sm:px-8 lg:px-16 py-8">
        <div className="max-w-6xl mx-auto">
          {/* Session Selection */}
          {!sessionReady && (
            <div className="rounded-3xl bg-white/5 border border-white/15 backdrop-blur-2xl px-6 sm:px-8 py-7 sm:py-8 shadow-[0_20px_80px_rgba(0,0,0,0.9)] mb-8 animate-[fadeInUp_0.7s_ease-out_forwards] opacity-0">
              <h2 className="text-lg sm:text-xl font-semibold text-white mb-6">
                Select Date &amp; Session
              </h2>

              <div className="space-y-6">
                {/* Date Picker */}
                <div>
                  <label className="block text-xs sm:text-sm font-medium mb-2 text-slate-200">
                    Date *
                  </label>
                  <input
                    type="date"
                    value={dateKey}
                    onChange={(e) => setDateKey(e.target.value)}
                    className="w-full px-4 py-2 bg-black/40 border border-white/15 rounded-xl text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500/70 focus:border-transparent"
                  />
                </div>

                {/* Session Selector */}
                {sessionConfig ? (
                  <div>
                    <label className="block text-xs sm:text-sm font-medium mb-3 text-slate-200">
                      Session * ({sessionConfig.sessionCount} available)
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {sessionConfig.sessionNames.map((name, idx) => (
                        <button
                          key={idx}
                          onClick={() => setSelectedSessionIndex(idx)}
                          className={`px-4 py-3 rounded-2xl border transition-all text-sm ${
                            selectedSessionIndex === idx
                              ? 'bg-amber-400 text-slate-900 border-amber-400 shadow-[0_12px_40px_rgba(251,191,36,0.4)]'
                              : 'bg-black/40 border-white/15 text-slate-200 hover:border-amber-300/70 hover:bg-white/5'
                          }`}
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/40 text-sm text-red-200">
                    ⚠️ No sessions configured for {dateKey}. Please contact admin.
                  </div>
                )}

                {/* Start Button */}
                {sessionConfig && (
                  <button
                    onClick={handleStartSession}
                    disabled={selectedSessionIndex === null}
                    className="w-full px-6 py-3 rounded-2xl bg-emerald-500 text-slate-900 font-semibold text-sm shadow-[0_14px_45px_rgba(16,185,129,0.5)] hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Start Attendance for{' '}
                    {selectedSessionIndex !== null
                      ? sessionConfig.sessionNames[selectedSessionIndex]
                      : 'Selected Session'}
                  </button>
                )}
              </div>
            </div>
          )}

          {sessionReady && selectedSessionIndex !== null && (
            <>
              {/* Session Info Banner */}
              <div className="mb-6 rounded-3xl bg-white/5 border border-amber-300/40 backdrop-blur-2xl px-6 sm:px-7 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shadow-[0_18px_60px_rgba(0,0,0,0.9)] animate-[fadeInUp_0.7s_ease-out_forwards] opacity-0">
                <div>
                  <p className="text-[11px] text-slate-300/80">Active Session</p>
                  <p className="text-lg sm:text-xl font-semibold text-amber-300">
                    {sessionConfig?.sessionNames[selectedSessionIndex]} • {dateKey}
                  </p>
                </div>
                <button
                  onClick={handleChangeSession}
                  className="px-4 py-2 rounded-2xl bg-black/40 border border-white/20 text-xs sm:text-sm text-slate-100 hover:bg-white/10 transition-colors"
                >
                  Change Session
                </button>
              </div>

              {/* Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 animate-[fadeInUp_0.7s_ease-out_0.03s_forwards] opacity-0">
                <div className="rounded-3xl bg-white/5 border border-white/15 backdrop-blur-2xl p-5 shadow-[0_1px_10px_rgba(0,0,0,0.9)]">
                  <div className="text-3xl font-semibold text-amber-300">
                    {stats.total}
                  </div>
                  <div className="text-xs text-slate-300 mt-1">Total Scanned</div>
                </div>
                <div className="rounded-3xl bg-white/5 border border-blue-300/40 backdrop-blur-2xl p-5 shadow-[0_1px_10px_rgba(30,64,175,0.6)]">
                  <div className="text-3xl font-semibold text-blue-300">
                    {stats.od}
                  </div>
                  <div className="text-xs text-slate-200 mt-1">OD Students</div>
                </div>
                <div className="rounded-3xl bg-white/5 border border-emerald-300/40 backdrop-blur-2xl p-5 shadow-[0_1px_10px_rgba(16,185,129,0.6)]">
                  <div className="text-3xl font-semibold text-emerald-300">
                    {stats.scholarship}
                  </div>
                  <div className="text-xs text-slate-200 mt-1">Scholarship Students</div>
                </div>
              </div>

              {/* Scanner Input */}
              <div className="rounded-3xl bg-white/5 border border-white/15 backdrop-blur-2xl px-6 sm:px-8 py-7 shadow-[0_20px_80px_rgba(0,0,0,0.95)] mb-8 animate-[fadeInUp_0.7s_ease-out_0.06s_forwards] opacity-0">
                <h2 className="text-lg sm:text-xl font-semibold mb-4 flex items-center gap-2 text-white">
                  <svg
                    className="w-5 h-5 text-amber-300"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
                    />
                  </svg>
                  Scan or Enter Register Number
                </h2>

                <form onSubmit={handleScan} className="space-y-4">
                  <input
                    ref={inputRef}
                    type="text"
                    value={regNoInput}
                    onChange={(e) => setRegNoInput(e.target.value)}
                    placeholder="Scan barcode or type register number..."
                    disabled={processing}
                    className="w-full px-6 py-4 bg-black/40 border-2 border-white/15 rounded-2xl text-lg font-mono text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent disabled:opacity-50"
                    autoComplete="off"
                  />

                  <button
                    type="submit"
                    disabled={processing || !regNoInput.trim()}
                    className="w-full px-6 py-3 rounded-2xl bg-amber-100 text-slate-900 font-semibold text-sm shadow-[0_0_1px_rgba(1,1,1,0.1)] hover:bg-amber-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {processing ? 'Processing…' : 'Mark Attendance'}
                  </button>
                </form>

                {error && (
                  <div className="mt-4 p-4 rounded-2xl bg-red-500/10 border border-red-500/40 flex items-start gap-2">
                    <svg
                      className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-300"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="text-red-100 text-sm">{error}</span>
                  </div>
                )}

                {lastScanned && (
                  <div className="mt-4 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/40">
                    <div className="flex items-start gap-3">
                      <svg
                        className="w-6 h-6 flex-shrink-0 text-emerald-300"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <div className="flex-1">
                        <p className="text-emerald-200 font-semibold text-sm">
                          ✅ Attendance Marked Successfully!
                        </p>
                        <div className="mt-1 text-xs text-slate-100">
                          <p>
                            <span className="font-semibold">
                              {lastScanned.studentName}
                            </span>{' '}
                            ({lastScanned.regNo})
                          </p>
                          <p className="text-slate-300 mt-0.5">
                            {lastScanned.committee &&
                              `Committee: ${lastScanned.committee} • `}
                            Category: {lastScanned.category.toUpperCase()} •{' '}
                            {new Date(lastScanned.timestamp).toLocaleTimeString(
                              'en-IN',
                              {
                                hour: '2-digit',
                                minute: '2-digit',
                              },
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Session Attendance Table */}
              <div className="rounded-3xl bg-white/5 border border-white/15 backdrop-blur-2xl px-4 sm:px-6 py-6 shadow-[0_20px_80px_rgba(0,0,0,0.95)] animate-[fadeInUp_0.7s_ease-out_0.09s_forwards] opacity-0">
                <h2 className="text-lg sm:text-xl font-semibold text-white mb-4">
                  Session Attendance ({sessionAttendance.length})
                </h2>

                {sessionAttendance.length === 0 ? (
                  <div className="text-center py-10 text-slate-400 text-sm">
                    <p className="mb-1">No attendance marked yet.</p>
                    <p>Scan student IDs to start filling this list.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs sm:text-sm">
                      <thead>
                        <tr className="border-b border-white/10">
                          <th className="py-3 px-3 sm:px-4 text-left font-semibold text-slate-300">
                            Time
                          </th>
                          <th className="py-3 px-3 sm:px-4 text-left font-semibold text-slate-300">
                            Reg No
                          </th>
                          <th className="py-3 px-3 sm:px-4 text-left font-semibold text-slate-300">
                            Name
                          </th>
                          <th className="py-3 px-3 sm:px-4 text-left font-semibold text-slate-300">
                            Committee
                          </th>
                          <th className="py-3 px-3 sm:px-4 text-left font-semibold text-slate-300">
                            Category
                          </th>
                          <th className="py-3 px-3 sm:px-4 text-left font-semibold text-slate-300">
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {sessionAttendance.map((record) => (
                          <tr
                            key={record.id}
                            className="border-b border-white/5 hover:bg-white/5"
                          >
                            <td className="py-3 px-3 sm:px-4 text-slate-300">
                              {record.timestamp?.seconds
                                ? new Date(
                                    record.timestamp.seconds * 1000,
                                  ).toLocaleTimeString('en-IN', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })
                                : new Date(
                                    record.timestamp,
                                  ).toLocaleTimeString('en-IN', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                            </td>
                            <td className="py-3 px-3 sm:px-4 font-mono text-amber-300">
                              {record.regNo}
                            </td>
                            <td className="py-3 px-3 sm:px-4 font-medium text-slate-100">
                              {record.studentName}
                            </td>
                            <td className="py-3 px-3 sm:px-4 text-slate-300">
                              {record.committee || '-'}
                            </td>
                            <td className="py-3 px-3 sm:px-4">
                              <span
                                className={`px-3 py-1 rounded-full text-[10px] sm:text-xs font-medium ${
                                  record.category === 'od'
                                    ? 'bg-blue-500/15 text-blue-200 border border-blue-400/40'
                                    : 'bg-emerald-500/15 text-emerald-200 border border-emerald-400/40'
                                }`}
                              >
                                {record.category.toUpperCase()}
                              </span>
                            </td>
                            <td className="py-3 px-3 sm:px-4">
                              <button
                                onClick={() => handleDelete(record)}
                                disabled={deleting === record.id}
                                className="px-3 py-1.5 rounded-2xl bg-red-500 text-white text-[10px] sm:text-xs font-medium hover:bg-red-400 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                              >
                                {deleting === record.id ? (
                                  <>
                                    <div className="animate-spin rounded-full h-3 w-3 border-2 border-white border-t-transparent" />
                                    Deleting…
                                  </>
                                ) : (
                                  <>
                                    <svg
                                      className="w-3 h-3"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                      />
                                    </svg>
                                    Delete
                                  </>
                                )}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </BackgroundShell>
  );
}
