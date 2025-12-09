'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/app/context/AuthContext';
import { useRouter } from 'next/navigation';
import { isAdmin } from '@/lib/utils/adminCheck';
import {
  setSessionConfig,
  getAllSessionConfigs,
  deleteSessionConfig,
  toggleSessionActive,
  deleteIndividualSession,
  reorderSessions,
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
  const [editingConfig, setEditingConfig] = useState<SessionConfig | null>(null);

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
    const newCount = Math.max(1, Math.min(10, count));
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

  const moveSession = (fromIndex: number, toIndex: number) => {
    const updated = [...sessionNames];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);
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

      setTimeout(() => {
        setDateKey(formatDateKey(new Date()));
        setSessionCount(4);
        setSessionNames(['Session 1', 'Session 2', 'Session 3', 'Session 4']);
        setEditingConfig(null);
        setSuccess('');
      }, 2000);
    } catch (e: any) {
      console.error(e);
      setError(`Failed to save: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAll = async (delDateKey: string) => {
    if (!confirm(`Delete ALL sessions for ${delDateKey}?`)) return;

    try {
      await deleteSessionConfig(delDateKey);
      setSuccess(`✅ Deleted all sessions for ${delDateKey}`);
      loadSessions();
      setTimeout(() => setSuccess(''), 2000);
    } catch (e: any) {
      setError(`Failed to delete: ${e.message}`);
    }
  };

  const handleDeleteSession = async (config: SessionConfig, sessionIndex: number) => {
    const sessionName = config.sessionNames[sessionIndex];
    if (!confirm(`Delete "${sessionName}" permanently? This cannot be undone.`)) return;

    try {
      await deleteIndividualSession(config.dateKey, sessionIndex);
      setSuccess(`✅ Deleted "${sessionName}"`);
      loadSessions();
      setTimeout(() => setSuccess(''), 2000);
    } catch (e: any) {
      setError(`Failed to delete session: ${e.message}`);
    }
  };

  const handleToggleSession = async (config: SessionConfig, sessionIndex: number) => {
    const sessionId = `session-${sessionIndex}`;
    const isActive = config.activeSessions?.includes(sessionId);
    
    try {
      await toggleSessionActive(config.dateKey, sessionIndex, !isActive);
      setSuccess(`✅ Session ${sessionIndex + 1} ${isActive ? 'disabled' : 'enabled'}`);
      loadSessions();
      setTimeout(() => setSuccess(''), 2000);
    } catch (e: any) {
      setError(`Failed to update session: ${e.message}`);
    }
  };

  const handleReorder = async (config: SessionConfig) => {
    if (confirm('Apply this new session order?')) {
      try {
        await reorderSessions(config.dateKey, sessionNames);
        setSuccess('✅ Session order updated!');
        loadSessions();
        setEditingConfig(null);
        setTimeout(() => setSuccess(''), 2000);
      } catch (e: any) {
        setError(`Failed to reorder: ${e.message}`);
      }
    }
  };

  const handleEdit = (config: SessionConfig) => {
    setEditingConfig(config);
    setDateKey(config.dateKey);
    setSessionCount(config.sessionNames.length);
    setSessionNames([...config.sessionNames]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetForm = () => {
    setEditingConfig(null);
    setDateKey(formatDateKey(new Date()));
    setSessionCount(4);
    setSessionNames(['Session 1', 'Session 2', 'Session 3', 'Session 4']);
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
              Advanced Session Management
            </h1>
            <p className="text-slate-400">
              Create, edit, delete individual sessions, toggle active status, and reorder
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
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold">
              {editingConfig ? `Edit ${editingConfig.dateKey}` : 'Create Session Configuration'}
            </h2>
            {editingConfig && (
              <button
                onClick={resetForm}
                className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-sm rounded-lg"
              >
                New Config
              </button>
            )}
          </div>

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

            {/* Session Names with Reorder Controls */}
            <div>
              <label className="block text-sm font-medium mb-3">Session Names & Order *</label>
              <div className="space-y-3">
                {sessionNames.map((name, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-3 bg-slate-800 border border-slate-700 rounded-lg">
                    <div className="flex items-center gap-2 flex-1">
                      <span className="w-8 text-sm font-medium text-slate-400">{idx + 1}.</span>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => handleSessionNameChange(idx, e.target.value)}
                        placeholder={`Session ${idx + 1}`}
                        className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm focus:border-amber-500"
                      />
                    </div>
                    {editingConfig && (
                      <div className="flex gap-1">
                        <button
                          onClick={() => moveSession(idx, idx - 1)}
                          disabled={idx === 0}
                          className="px-2 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-xs rounded text-white"
                          title="Move Up"
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => moveSession(idx, idx + 1)}
                          disabled={idx === sessionNames.length - 1}
                          className="px-2 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-xs rounded text-white"
                          title="Move Down"
                        >
                          ↓
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {editingConfig && (
                <div className="mt-4 p-3 bg-blue-500/20 border border-blue-500/30 rounded-lg">
                  <button
                    onClick={() => handleReorder(editingConfig)}
                    className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg"
                  >
                    🔄 Apply New Order
                  </button>
                </div>
              )}
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
          <h2 className="text-xl font-semibold mb-6">Active Configurations</h2>

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
            <div className="space-y-6">
              {sessions.map((config) => (
                <div
                  key={config.id}
                  className="p-6 bg-slate-800 border border-slate-700 rounded-xl"
                >
                  <div className="flex items-start justify-between mb-6">
                    <div className="flex items-center gap-4">
                      <span className="text-2xl font-bold text-amber-400">
                        {config.dateKey}
                      </span>
                      <span className="px-4 py-2 bg-emerald-500/20 text-emerald-300 text-sm font-semibold rounded-full border border-emerald-500/30">
                        {config.sessionCount} Sessions
                      </span>
                      <span className="px-4 py-2 bg-slate-500/30 text-slate-300 text-sm font-medium rounded-full">
                        {config.activeSessions?.length || 0} Active
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(config)}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteAll(config.dateKey)}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg"
                      >
                        Delete All
                      </button>
                    </div>
                  </div>

                  {/* Individual Sessions with Delete */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {config.sessionNames.map((name, idx) => {
                      const sessionId = `session-${idx}`;
                      const isActive = config.activeSessions?.includes(sessionId);
                      return (
                        <div key={idx} className="p-4 border rounded-lg bg-slate-700/50 border-slate-600 group hover:border-amber-500/50 transition-all">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-sm mb-1 truncate" title={name}>
                                {name}
                              </div>
                              <div className="text-xs text-slate-400">Session {idx + 1}</div>
                            </div>
                            <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                              <button
                                onClick={() => handleToggleSession(config, idx)}
                                className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                                  isActive
                                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md'
                                    : 'bg-red-600/20 hover:bg-red-600/40 text-red-300 border border-red-600/30 hover:border-red-600/50'
                                }`}
                                title={isActive ? 'Disable Session' : 'Enable Session'}
                              >
                                {isActive ? 'Active' : 'Disabled'}
                              </button>
                              <button
                                onClick={() => handleDeleteSession(config, idx)}
                                className="px-2 py-1 bg-red-600/80 hover:bg-red-600 text-white text-xs font-medium rounded-full shadow-md hover:shadow-lg transition-all opacity-0 group-hover:opacity-100"
                                title={`Delete "${name}"`}
                              >
                                🗑️
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
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
