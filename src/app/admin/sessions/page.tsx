// app/admin/sessions/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/app/context/AuthContext';
import { useRouter } from 'next/navigation';
import { isAdmin } from '@/lib/utils/adminCheck';
import {
  setSessionConfig,
  getAllSessionConfigs,
  deleteSessionConfig,
  SessionConfig,
} from '@/lib/services/sessionService';

const formatDateKey = (d: Date) => d.toISOString().split('T')[0];

export default function AdminSessionsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [sessions, setSessions] = useState<SessionConfig[]>([]);
  const [fetching, setFetching] = useState(true);

  // Form state
  const [dateKey, setDateKey] = useState(formatDateKey(new Date()));
  const [sessionCount, setSessionCount] = useState(4);
  const [sessionNames, setSessionNames] = useState<string[]>([
    'Session 1',
    'Session 2',
    'Session 3',
    'Session 4',
  ]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!loading && user && isAdmin(user.email)) {
      loadSessions();
    }
  }, [loading, user]);

  const loadSessions = async () => {
    setFetching(true);
    try {
      const data = await getAllSessionConfigs();
      setSessions(data);
    } catch (e) {
      console.error(e);
    } finally {
      setFetching(false);
    }
  };

  const handleSessionCountChange = (count: number) => {
    const newCount = Math.max(1, Math.min(10, count)); // Limit 1-10
    setSessionCount(newCount);

    const newNames = Array.from({ length: newCount }, (_, i) =>
      sessionNames[i] || `Session ${i + 1}`,
    );
    setSessionNames(newNames);
  };

  const handleSessionNameChange = (index: number, value: string) => {
    const updated = [...sessionNames];
    updated[index] = value;
    setSessionNames(updated);
  };

  const handleSave = async () => {
    setError('');
    setSuccess('');

    if (!dateKey) {
      setError('Please select a date.');
      return;
    }

    if (sessionNames.some((n) => !n.trim())) {
      setError('All session names must be filled.');
      return;
    }

    setSaving(true);
    try {
      await setSessionConfig(dateKey, sessionCount, sessionNames, user!.uid);
      setSuccess(`✅ Session configuration for ${dateKey} saved successfully!`);
      loadSessions();

      // Reset form
      setTimeout(() => {
        setDateKey(formatDateKey(new Date()));
        setSessionCount(4);
        setSessionNames(['Session 1', 'Session 2', 'Session 3', 'Session 4']);
        setSuccess('');
      }, 2000);
    } catch (e) {
      console.error(e);
      setError(`Failed to save: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (delDateKey: string) => {
    if (!confirm(`Delete session configuration for ${delDateKey}?`)) return;

    try {
      await deleteSessionConfig(delDateKey);
      setSuccess(`✅ Deleted session config for ${delDateKey}`);
      loadSessions();
      setTimeout(() => setSuccess(''), 2000);
    } catch (e) {
      setError(`Failed to delete: ${e}`);
    }
  };

  const handleEdit = (config: SessionConfig) => {
    setDateKey(config.dateKey);
    setSessionCount(config.sessionCount);
    setSessionNames([...config.sessionNames]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (loading || !user || !isAdmin(user.email)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-100 mb-2">
              Session Management
            </h1>
            <p className="text-slate-400">
              Configure daily attendance sessions with custom names
            </p>
          </div>
          <button
            onClick={() => router.push('/admin')}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg text-sm"
          >
            ← Back
          </button>
        </div>

        {/* Messages */}
        {error && (
          <div className="mb-4 p-4 bg-red-900/50 border border-red-500 rounded-lg">
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-4 p-4 bg-emerald-900/50 border border-emerald-500 rounded-lg">
            <p className="text-emerald-300 text-sm">{success}</p>
          </div>
        )}

        {/* Create/Edit Form */}
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-8 mb-8">
          <h2 className="text-xl font-semibold mb-6">Create/Edit Session Configuration</h2>

          <div className="space-y-6">
            {/* Date */}
            <div>
              <label className="block text-sm font-medium mb-2">Date *</label>
              <input
                type="date"
                value={dateKey}
                onChange={(e) => setDateKey(e.target.value)}
                className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm"
              />
            </div>

            {/* Session Count */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Number of Sessions * (1-10)
              </label>
              <input
                type="number"
                min="1"
                max="10"
                value={sessionCount}
                onChange={(e) => handleSessionCountChange(parseInt(e.target.value) || 1)}
                className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm"
              />
            </div>

            {/* Session Names */}
            <div>
              <label className="block text-sm font-medium mb-3">Session Names *</label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {sessionNames.map((name, idx) => (
                  <input
                    key={idx}
                    type="text"
                    value={name}
                    onChange={(e) => handleSessionNameChange(idx, e.target.value)}
                    placeholder={`Session ${idx + 1}`}
                    className="px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm"
                  />
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Examples: &quot;Morning Session&quot;, &quot;Afternoon Lab&quot;, &quot;Session 1&quot;, etc.
              </p>
            </div>

            {/* Save Button */}
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full px-6 py-3 bg-amber-600 hover:bg-amber-700 text-slate-900 font-semibold rounded-lg disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Session Configuration'}
            </button>
          </div>
        </div>

        {/* Existing Configurations */}
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-6">
          <h2 className="text-xl font-semibold mb-6">Existing Configurations</h2>

          {fetching ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
              <span className="ml-3 text-slate-400">Loading...</span>
            </div>
          ) : !sessions.length ? (
            <div className="text-center py-12 text-slate-500">
              <p className="text-lg mb-2">No session configurations yet</p>
              <p className="text-sm">Create your first session configuration above</p>
            </div>
          ) : (
            <div className="space-y-4">
              {sessions.map((config) => (
                <div
                  key={config.id}
                  className="p-5 bg-slate-800 border border-slate-700 rounded-lg flex items-start justify-between"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-lg font-semibold text-amber-400">
                        {config.dateKey}
                      </span>
                      <span className="px-3 py-1 bg-blue-500/20 text-blue-300 text-xs font-medium rounded-full border border-blue-500/30">
                        {config.sessionCount} Sessions
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-3">
                      {config.sessionNames.map((name, idx) => (
                        <span
                          key={idx}
                          className="px-3 py-1 bg-slate-700 text-slate-300 text-sm rounded-md"
                        >
                          {idx + 1}. {name}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(config)}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(config.dateKey)}
                      className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
