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
  findExistingAttendance,        // ✅ NEW: Replaces checkDuplicateSessionFast
  updateAttendanceCategory,      // ✅ NEW: For category changes
  AttendanceRecord,
} from '@/lib/services/attendanceService';
import { getStudentCached } from '@/lib/services/studentCache';
import { getSessionConfig, SessionConfig } from '@/lib/services/sessionService';

const formatDateKey = (d: Date) => d.toISOString().split('T')[0];

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

  // ✅ FIXED: Load BOTH OD and Scholarship attendance
  useEffect(() => {
    const loadAttendance = async () => {
      if (!user || !sessionReady || selectedSessionIndex === null) return;

      const sessionId = `${dateKey}-session-${selectedSessionIndex}`;

      try {
        // Load OD records
        const odRecords = await getSessionAttendance(user.uid, 'od', sessionId);
        // Load Scholarship records separately
        const scholarshipRecords = await getSessionAttendance(user.uid, 'scholarship', sessionId);
        
        // ✅ Combine both OD and Scholarship records
        const allRecords = [...odRecords, ...scholarshipRecords];
        
        // Sort by timestamp (newest first)
        allRecords.sort((a, b) => {
          const timeA = a.timestamp?.seconds ? a.timestamp.seconds * 1000 : new Date(a.timestamp).getTime();
          const timeB = b.timestamp?.seconds ? b.timestamp.seconds * 1000 : new Date(b.timestamp).getTime();
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

  // ⚡ OPTIMIZED: Start session with cache preloading
  const handleStartSession = async () => {
    if (selectedSessionIndex === null) {
      setError('Please select a session first');
      return;
    }

    setError('');
    setSessionReady(true);

    // Preload session cache in background
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

  // ✅ FIXED: Cross-page duplicate prevention using findExistingAttendance
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

      // 1. Lookup student (CACHED - instant after first load)
      const student = await getStudentCached(regNo);

      if (!student) {
        setError(`❌ Student ${regNo} not found in database`);
        setRegNoInput('');
        setProcessing(false);
        return;
      }

      // 2. Check category eligibility
      const hasOD = student.categories?.od === true;
      const hasScholarship = student.categories?.scholarship === true;

      if (!hasOD && !hasScholarship) {
        setError(`⚠️ ${student.name} (${regNo}) is not registered for OD or Scholarship`);
        setRegNoInput('');
        setProcessing(false);
        return;
      }

      const category: 'od' | 'scholarship' = hasOD ? 'od' : 'scholarship';

      // ✅ PROBLEM FIXED: Check if ANY attendance exists for this session (LAB/OD/Scholarship)
      const existing = await findExistingAttendance(regNo, sessionId);

      if (existing) {
        if (existing.category === category) {
          // Same category → simple duplicate
          setError(
            `⚠️ ${student.name} (${regNo}) is already marked as ${category.toUpperCase()} for ${sessionName}`
          );
          setRegNoInput('');
          setProcessing(false);
          return;
        } else {
          // Different category (e.g. LAB vs OD/Scholarship) - Offer to change
          const confirmed = confirm(
            `${student.name} (${regNo}) is already marked as ${existing.category.toUpperCase()} for this session.\n\nDo you want to change it to ${category.toUpperCase()}?`
          );

          if (!confirmed || !existing.id) {
            setRegNoInput('');
            setProcessing(false);
            return;
          }

          // Update category (LAB → OD/Scholarship or vice versa)
          await updateAttendanceCategory(existing.id, category, user!.uid, user!.email!);

          // Update local state
          setSessionAttendance((prev) =>
            prev.map((r) =>
              r.id === existing.id ? { ...r, category } : r,
            ),
          );

          // Update stats (adjust counts)
          setStats((prev) => {
            const newStats = { ...prev };
            if (existing.category === 'od') newStats.od--;
            if (existing.category === 'scholarship') newStats.scholarship--;
            newStats[category]++;
            return newStats;
          });

          const updated: AttendanceRecord = { ...existing, category };
          setLastScanned(updated);
          console.log('✅ Category changed to', category, ':', regNo);
          setRegNoInput('');
          setProcessing(false);
          return;
        }
      }

      // 3. No existing record → Create new OD/Scholarship record
      const record = await markAttendanceFast(
        student,
        category,
        user!.uid,
        user!.email!,
        dateKey,
        selectedSessionIndex,
        sessionName,
      );

      // 4. Update UI (optimistic)
      setSessionAttendance((prev) => [record, ...prev]);
      setLastScanned(record);
      setStats((prev) => ({
        ...prev,
        total: prev.total + 1,
        [category]: prev[category] + 1,
      }));

      console.log('✅ Attendance marked:', record);
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
      `Delete attendance for ${record.studentName} (${record.regNo})?\n\nThis action cannot be undone.`
    );

    if (!confirmed) return;

    setDeleting(record.id);

    try {
      const sessionId = `${dateKey}-session-${selectedSessionIndex}`;
      
      await deleteAttendanceRecord(record.id, record.regNo, record.category, sessionId);

      setSessionAttendance((prev) => prev.filter((r) => r.id !== record.id));

      setStats((prev) => ({
        ...prev,
        total: prev.total - 1,
        [record.category]: prev[record.category] - 1,
      }));

      console.log('✅ Attendance deleted:', record.regNo);
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
          <span className="font-semibold text-amber-400">OD / Scholarship Attendance</span>
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
                  Start Attendance for{' '}
                  {selectedSessionIndex !== null
                    ? sessionConfig.sessionNames[selectedSessionIndex]
                    : 'Selected Session'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Rest of JSX remains exactly the same... */}
        {sessionReady && selectedSessionIndex !== null && (
          <>
            {/* Session Info Banner */}
            <div className="mb-6 p-4 bg-gradient-to-r from-amber-900/50 to-slate-900 border border-amber-700/50 rounded-xl flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Active Session</p>
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

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <div className="bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700 rounded-xl p-6">
                <div className="text-3xl font-bold text-amber-400">{stats.total}</div>
                <div className="text-sm text-slate-400 mt-1">Total Scanned</div>
              </div>
              <div className="bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700 rounded-xl p-6">
                <div className="text-3xl font-bold text-blue-400">{stats.od}</div>
                <div className="text-sm text-slate-400 mt-1">OD Students</div>
              </div>
              <div className="bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700 rounded-xl p-6">
                <div className="text-3xl font-bold text-emerald-400">{stats.scholarship}</div>
                <div className="text-sm text-slate-400 mt-1">Scholarship Students</div>
              </div>
            </div>

            {/* Scanner Input */}
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
                  className="w-full px-6 py-4 bg-slate-800 border-2 border-slate-600 rounded-lg text-lg font-mono focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent disabled:opacity-50"
                  autoComplete="off"
                />

                <button
                  type="submit"
                  disabled={processing || !regNoInput.trim()}
                  className="w-full px-6 py-3 bg-amber-600 hover:bg-amber-700 text-slate-900 font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {processing ? 'Processing...' : 'Mark Attendance'}
                </button>
              </form>

              {/* Error & Success messages remain the same */}
              {error && (
                <div className="mt-4 p-4 bg-red-900/50 border border-red-500 rounded-lg flex items-start gap-2">
                  <svg
                    className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-400"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="text-red-300 text-sm">{error}</span>
                </div>
              )}

              {lastScanned && (
                <div className="mt-4 p-4 bg-emerald-900/50 border border-emerald-500 rounded-lg">
                  <div className="flex items-start gap-3">
                    <svg
                      className="w-6 h-6 flex-shrink-0 text-emerald-400"
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
                      <p className="text-emerald-300 font-semibold">
                        ✅ Attendance Marked Successfully!
                      </p>
                      <div className="mt-2 text-sm text-slate-300">
                        <p>
                          <span className="font-semibold">{lastScanned.studentName}</span> (
                          {lastScanned.regNo})
                        </p>
                        <p className="text-slate-400">
                          {lastScanned.committee && `Committee: ${lastScanned.committee} • `}
                          Category: {lastScanned.category.toUpperCase()} •{' '}
                          {new Date(lastScanned.timestamp).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Session Attendance Table - SAME AS BEFORE */}
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-6">
              <h2 className="text-xl font-semibold mb-6">
                Session Attendance ({sessionAttendance.length})
              </h2>

              {sessionAttendance.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <p className="text-lg mb-2">No attendance marked yet</p>
                  <p className="text-sm">Scan student IDs to start</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700">
                        <th className="py-3 px-4 text-left font-semibold text-slate-300">Time</th>
                        <th className="py-3 px-4 text-left font-semibold text-slate-300">Reg No</th>
                        <th className="py-3 px-4 text-left font-semibold text-slate-300">Name</th>
                        <th className="py-3 px-4 text-left font-semibold text-slate-300">Committee</th>
                        <th className="py-3 px-4 text-left font-semibold text-slate-300">Category</th>
                        <th className="py-3 px-4 text-left font-semibold text-slate-300">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessionAttendance.map((record) => (
                        <tr key={record.id} className="border-b border-slate-800 hover:bg-slate-850">
                          <td className="py-3 px-4 text-slate-400">
                            {record.timestamp?.seconds
                              ? new Date(record.timestamp.seconds * 1000).toLocaleTimeString('en-IN', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : new Date(record.timestamp).toLocaleTimeString('en-IN', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                          </td>
                          <td className="py-3 px-4 font-mono text-amber-400">{record.regNo}</td>
                          <td className="py-3 px-4 font-medium">{record.studentName}</td>
                          <td className="py-3 px-4 text-slate-400">{record.committee || '-'}</td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-3 py-1 rounded-full text-xs font-medium ${
                                record.category === 'od'
                                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              }`}
                            >
                              {record.category.toUpperCase()}
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
                                <>
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
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
      </main>
    </div>
  );
}
