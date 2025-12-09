// app/coordinator/lab/page.tsx
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

export default function LabAttendancePage() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [checkingAccess, setCheckingAccess] = useState(true);

  // Date & Session
  const [dateKey, setDateKey] = useState(formatDateKey(new Date()));
  const [sessionConfig, setSessionConfig] = useState<SessionConfig | null>(null);
  const [selectedSessionIndex, setSelectedSessionIndex] = useState<number | null>(
    null,
  );
  const [sessionReady, setSessionReady] = useState(false);

  // Scanning
  const [regNoInput, setRegNoInput] = useState('');
  const [processing, setProcessing] = useState(false);
  const [sessionAttendance, setSessionAttendance] = useState<AttendanceRecord[]>(
    [],
  );
  const [lastScanned, setLastScanned] = useState<AttendanceRecord | null>(null);
  const [error, setError] = useState('');

  const [stats, setStats] = useState({ total: 0, lab: 0 });
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
      setStats({ total: 0, lab: 0 });
    };

    loadSessionConfig();
  }, [dateKey]);

  // Load attendance when session is selected
  useEffect(() => {
    const loadAttendance = async () => {
      if (!user || !sessionReady || selectedSessionIndex === null) return;

      const sessionId = `${dateKey}-session-${selectedSessionIndex}`;

      try {
        const records = await getSessionAttendance(user.uid, 'lab', sessionId);
        setSessionAttendance(records);

        const labCount = records.filter((r) => r.category === 'lab').length;
        setStats({
          total: records.length,
          lab: labCount,
        });
      } catch (e) {
        console.error('Failed to load lab attendance:', e);
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

  const handleStartSession = async () => {
    if (selectedSessionIndex === null) {
      setError('Please select a session first');
      return;
    }

    setError('');
    setSessionReady(true);

    const sessionId = `${dateKey}-session-${selectedSessionIndex}`;
    if (user) {
      preloadSessionCache(user.uid, 'lab', sessionId).catch((e) =>
        console.error('Cache preload failed:', e),
      );
    }
  };

  // LAB scan logic with cross-page duplicate handling
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
        sessionConfig?.sessionNames[selectedSessionIndex] ||
        `Session ${selectedSessionIndex + 1}`;

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
          `⚠️ ${student.name} (${regNo}) is not in OD or Scholarship list, cannot mark LAB`,
        );
        setRegNoInput('');
        setProcessing(false);
        return;
      }

      const existing = await findExistingAttendance(regNo, sessionId);

      if (!existing) {
        const record = await markAttendanceFast(
          {
            regNo: regNo,
            name: student.name,
            department: student.department,
            committee: student.committee,
            hostel: student.hostel,
            roomNumber: student.roomNumber,
            phoneNumber: student.phoneNumber,
          } as any,
          'lab',
          user!.uid,
          user!.email!,
          dateKey,
          selectedSessionIndex,
          sessionName,
        );

        setSessionAttendance((prev) => [record, ...prev]);
        setLastScanned(record);
        setStats((prev) => ({
          total: prev.total + 1,
          lab: prev.lab + 1,
        }));
      } else {
        if (existing.category === 'lab') {
          setError(
            `⚠️ ${existing.studentName} (${existing.regNo}) is already marked as LAB for this session`,
          );
        } else {
          const confirmed = confirm(
            `${existing.studentName} (${existing.regNo}) is already marked as ${existing.category.toUpperCase()} for this session.\n\nDo you want to change it to LAB?`,
          );

          if (confirmed && existing.id) {
            await updateAttendanceCategory(existing.id, 'lab', user!.uid, user!.email!);

            setSessionAttendance((prev) =>
              prev.map((r) =>
                r.id === existing.id ? { ...r, category: 'lab' as const } : r,
              ),
            );

            setStats((prev) => ({
              total: prev.total,
              lab: prev.lab + (existing.category === 'lab' ? 0 : 1),
            }));

            const updated: AttendanceRecord = {
              ...existing,
              category: 'lab',
            };

            setLastScanned(updated);
          }
        }
      }
    } catch (err) {
      console.error('LAB scan error:', err);
      setError(`❌ Failed to mark LAB attendance: ${err}`);
    } finally {
      setRegNoInput('');
      setProcessing(false);
    }
  };

  // Delete a lab record
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
        lab: prev.lab - (record.category === 'lab' ? 1 : 0),
      }));
    } catch (err) {
      console.error('Delete error:', err);
      setError(`❌ Failed to delete: ${err}`);
    } finally {
      setDeleting(null);
    }
  };

  const handleChangeSession = () => {
    if (selectedSessionIndex !== null) {
      const sessionId = `${dateKey}-session-${selectedSessionIndex}`;
      clearSessionCache(sessionId);
    }
    setSessionReady(false);
    setSessionAttendance([]);
    setStats({ total: 0, lab: 0 });
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
      {/* Header */}
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
              LAB Attendance
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
                              ? 'bg-amber-100 text-slate-900 border-amber-100 shadow-[0_0_0_rgba(251,191,36,0.4)]'
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
                    className="w-full px-6 py-3 rounded-2xl bg-emerald-200 text-slate-900 font-semibold text-sm shadow-[0_1px_15px_rgba(1,185,129,0.1)] hover:bg-emerald-500 disabled:opacity-10 disabled:cursor-not-allowed transition-colors"
                  >
                    Start LAB Attendance for{' '}
                    {selectedSessionIndex !== null
                      ? sessionConfig.sessionNames[selectedSessionIndex]
                      : 'Selected Session'}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Attendance Marking */}
          {sessionReady && selectedSessionIndex !== null && (
            <>
              {/* Session Info */}
              <div className="mb-6 rounded-3xl bg-white/5 border border-purple-300/40 backdrop-blur-2xl px-6 sm:px-7 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shadow-[0_18px_60px_rgba(0,0,0,0.9)] animate-[fadeInUp_0.7s_ease-out_forwards] opacity-0">
                <div>
                  <p className="text-[11px] text-slate-300/80">Active LAB Session</p>
                  <p className="text-lg sm:text-xl font-semibold text-purple-200">
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

              {/* Stats */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8 animate-[fadeInUp_0.7s_ease-out_0.03s_forwards] opacity-0">
                <div className="rounded-3xl bg-white/5 border border-white/15 backdrop-blur-2xl p-5 shadow-[0_1px_10px_rgba(0,0,0,0.9)]">
                  <div className="text-3xl font-semibold text-amber-300">
                    {stats.total}
                  </div>
                  <div className="text-xs text-slate-300 mt-1">Total Scanned</div>
                </div>
                <div className="rounded-3xl bg-white/5 border border-purple-300/40 backdrop-blur-2xl p-5 shadow-[0_1px_10px_rgba(147,51,234,0.6)]">
                  <div className="text-3xl font-semibold text-purple-300">
                    {stats.lab}
                  </div>
                  <div className="text-xs text-slate-200 mt-1">LAB Students</div>
                </div>
              </div>

              {/* Scanner */}
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
                  Scan or Enter Register Number (LAB)
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
                    className="w-full px-6 py-3 rounded-2xl bg-amber-100 text-slate-900 font-semibold text-sm shadow-[0_1px_10px_rgba(251,191,36,0.1)] hover:bg-amber-200 disabled:opacity-10 disabled:cursor-not-allowed transition-colors"
                  >
                    {processing ? 'Processing…' : 'Mark LAB Attendance'}
                  </button>
                </form>

                {error && (
                  <div className="mt-4 p-4 rounded-2xl bg-red-500/10 border border-red-500/40 flex items-start gap-2">
                    <span className="text-red-100 text-sm">{error}</span>
                  </div>
                )}

                {lastScanned && (
                  <div className="mt-4 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/40">
                    <p className="text-emerald-200 font-semibold text-sm">
                      ✅ LAB Attendance Marked!
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
                        Category: LAB •{' '}
                        {new Date(lastScanned.timestamp).toLocaleTimeString('en-IN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Session Attendance Table */}
              <div className="rounded-3xl bg-white/5 border border-white/15 backdrop-blur-2xl px-4 sm:px-6 py-6 shadow-[0_20px_80px_rgba(0,0,0,0.95)] animate-[fadeInUp_0.7s_ease-out_0.09s_forwards] opacity-0">
                <h2 className="text-lg sm:text-xl font-semibold text-white mb-4">
                  LAB Session Attendance ({sessionAttendance.length})
                </h2>

                {sessionAttendance.length === 0 ? (
                  <div className="text-center py-10 text-slate-400 text-sm">
                    <p className="mb-1">No LAB attendance marked yet.</p>
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
                              <span className="px-3 py-1 rounded-full text-[10px] sm:text-xs font-medium bg-purple-500/20 text-purple-200 border border-purple-400/40">
                                LAB
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
                                  'Delete'
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
