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

const formatDateKey = (d: Date) => d.toISOString().split('T')[0];

export default function LabAttendancePage() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [checkingAccess, setCheckingAccess] = useState(true);

  // Date & Session
  const [dateKey, setDateKey] = useState(formatDateKey(new Date()));
  const [sessionConfig, setSessionConfig] = useState<SessionConfig | null>(null);
  const [selectedSessionIndex, setSelectedSessionIndex] = useState<number | null>(null);
  const [sessionReady, setSessionReady] = useState(false);

  // Scanning
  const [regNoInput, setRegNoInput] = useState('');
  const [processing, setProcessing] = useState(false);
  const [sessionAttendance, setSessionAttendance] = useState<AttendanceRecord[]>([]);
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
      // Warm LAB cache; OD/Scholarship page will warm its own
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
        sessionConfig?.sessionNames[selectedSessionIndex] || `Session ${selectedSessionIndex + 1}`;

      // 1. Lookup student in DB
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

      // 2. Check if any attendance already exists for this session (any category)
      const existing = await findExistingAttendance(regNo, sessionId);

      if (!existing) {
        // ✅ New LAB record
        const record = await markAttendanceFast(
          {
            regNo: regNo,
            name: student.name,
            department: student.department,
            committee: student.committee,
            hostel: student.hostel,
            roomNumber: student.roomNumber,
            phoneNumber: student.phoneNumber,
          } as any, // Student shape compatible with markAttendanceFast
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

        console.log('✅ LAB attendance marked:', record);
      } else {
        // There is already some category for this session
        if (existing.category === 'lab') {
          setError(
            `⚠️ ${existing.studentName} (${existing.regNo}) is already marked as LAB for this session`,
          );
        } else {
          // existing is OD or Scholarship → offer to change to LAB
          const confirmed = confirm(
            `${existing.studentName} (${existing.regNo}) is already marked as ${existing.category.toUpperCase()} for this session.\n\nDo you want to change it to LAB?`,
          );

          if (confirmed && existing.id) {
            await updateAttendanceCategory(existing.id, 'lab', user!.uid, user!.email!);

            // Update local state
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
            console.log('✅ Category changed to LAB:', existing.regNo);
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
    if (!record.id || selectedSessionIndex === null) return;

    const confirmed = confirm(
      `Delete LAB attendance for ${record.studentName} (${record.regNo})?\n\nThis action cannot be undone.`,
    );
    if (!confirmed) return;

    setDeleting(record.id);

    try {
      const sessionId = `${dateKey}-session-${selectedSessionIndex}`;
      await deleteAttendanceRecord(record.id, record.regNo, record.category, sessionId);

      setSessionAttendance((prev) => prev.filter((r) => r.id !== record.id));
      setStats((prev) => ({
        total: prev.total - 1,
        lab: record.category === 'lab' ? prev.lab - 1 : prev.lab,
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
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto mb-4"></div>
          <p className="text-lg">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <button
            onClick={() => router.push('/coordinator')}
            className="text-slate-400 hover:text-amber-400"
          >
            ← Back
          </button>
          <span className="font-semibold text-amber-400">LAB Attendance</span>
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

      <main className="p-6 max-w-7xl mx-auto">
        {/* Session Selection */}
        {!sessionReady && (
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-8 mb-6">
            <h2 className="text-xl font-semibold mb-6">Select Date & Session</h2>

            <div className="space-y-6">
              {/* Date Picker */}
              <div>
                <label className="block text-sm font-medium mb-2">Date *</label>
                <input
                  type="date"
                  value={dateKey}
                  onChange={(e) => setDateKey(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm"
                />
              </div>

              {/* Session Selector */}
              {sessionConfig ? (
                <div>
                  <label className="block text-sm font-medium mb-3">
                    Session * ({sessionConfig.sessionCount} available)
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {sessionConfig.sessionNames.map((name, idx) => (
                      <button
                        key={idx}
                        onClick={() => setSelectedSessionIndex(idx)}
                        className={`px-4 py-3 rounded-lg border-2 transition-all ${
                          selectedSessionIndex === idx
                            ? 'bg-amber-600 border-amber-600 text-slate-900 font-semibold'
                            : 'bg-slate-800 border-slate-600 hover:border-slate-500 text-slate-300'
                        }`}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-red-900/50 border border-red-500 rounded-lg">
                  <p className="text-red-300 text-sm">
                    ⚠️ No sessions configured for {dateKey}. Please contact admin.
                  </p>
                </div>
              )}

              {/* Start Button */}
              {sessionConfig && (
                <button
                  onClick={handleStartSession}
                  disabled={selectedSessionIndex === null}
                  className="w-full px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
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
            <div className="mb-6 p-4 bg-gradient-to-r from-amber-900/50 to-slate-900 border border-amber-700/50 rounded-xl flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Active LAB Session</p>
                <p className="text-xl font-semibold text-amber-400">
                  {sessionConfig?.sessionNames[selectedSessionIndex]} - {dateKey}
                </p>
              </div>
              <button
                onClick={handleChangeSession}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm"
              >
                Change Session
              </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              <div className="bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700 rounded-xl p-6">
                <div className="text-3xl font-bold text-amber-400">{stats.total}</div>
                <div className="text-sm text-slate-400 mt-1">Total Scanned</div>
              </div>
              <div className="bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700 rounded-xl p-6">
                <div className="text-3xl font-bold text-purple-400">{stats.lab}</div>
                <div className="text-sm text-slate-400 mt-1">LAB Students</div>
              </div>
            </div>

            {/* Scanner */}
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-8 mb-6">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <svg
                  className="w-6 h-6 text-amber-400"
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
                  className="w-full px-6 py-4 bg-slate-800 border-2 border-slate-600 rounded-lg text-lg font-mono focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent disabled:opacity-50"
                  autoComplete="off"
                />

                <button
                  type="submit"
                  disabled={processing || !regNoInput.trim()}
                  className="w-full px-6 py-3 bg-amber-600 hover:bg-amber-700 text-slate-900 font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {processing ? 'Processing...' : 'Mark LAB Attendance'}
                </button>
              </form>

              {error && (
                <div className="mt-4 p-4 bg-red-900/50 border border-red-500 rounded-lg flex items-start gap-2">
                  <span className="text-red-300 text-sm">{error}</span>
                </div>
              )}

              {lastScanned && (
                <div className="mt-4 p-4 bg-emerald-900/50 border border-emerald-500 rounded-lg">
                  <p className="text-emerald-300 font-semibold">✅ LAB Attendance Marked!</p>
                  <div className="mt-2 text-sm text-slate-300">
                    <p>
                      <span className="font-semibold">{lastScanned.studentName}</span> (
                      {lastScanned.regNo})
                    </p>
                    <p className="text-slate-400">
                      {lastScanned.committee && `Committee: ${lastScanned.committee} • `}
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
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-6">
              <h2 className="text-xl font-semibold mb-6">
                LAB Session Attendance ({sessionAttendance.length})
              </h2>

              {sessionAttendance.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <p className="text-lg mb-2">No LAB attendance marked yet</p>
                  <p className="text-sm">Scan student IDs to start</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700">
                        <th className="py-3 px-4 text-left font-semibold text-slate-300">Time</th>
                        <th className="py-3 px-4 text-left font-semibold text-slate-300">
                          Reg No
                        </th>
                        <th className="py-3 px-4 text-left font-semibold text-slate-300">Name</th>
                        <th className="py-3 px-4 text-left font-semibold text-slate-300">
                          Committee
                        </th>
                        <th className="py-3 px-4 text-left font-semibold text-slate-300">
                          Category
                        </th>
                        <th className="py-3 px-4 text-left font-semibold text-slate-300">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessionAttendance.map((record) => (
                        <tr key={record.id} className="border-b border-slate-800 hover:bg-slate-850">
                          <td className="py-3 px-4 text-slate-400">
                            {record.timestamp?.seconds
                              ? new Date(record.timestamp.seconds * 1000).toLocaleTimeString(
                                  'en-IN',
                                  { hour: '2-digit', minute: '2-digit' },
                                )
                              : new Date(record.timestamp).toLocaleTimeString('en-IN', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                          </td>
                          <td className="py-3 px-4 font-mono text-amber-400">{record.regNo}</td>
                          <td className="py-3 px-4 font-medium">{record.studentName}</td>
                          <td className="py-3 px-4 text-slate-400">{record.committee || '-'}</td>
                          <td className="py-3 px-4">
                            <span className="px-3 py-1 rounded-full text-xs font-medium bg-purple-500/20 text-purple-300 border border-purple-500/30">
                              LAB
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <button
                              onClick={() => handleDelete(record)}
                              disabled={deleting === record.id}
                              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                            >
                              {deleting === record.id ? (
                                <>
                                  <div className="animate-spin rounded-full h-3 w-3 border-2 border-white border-t-transparent"></div>
                                  Deleting...
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
      </main>
    </div>
  );
}
