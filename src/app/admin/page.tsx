// app/admin/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { isAdmin } from '@/lib/utils/adminCheck';
import { isKarunyaEmail } from '@/lib/validators/emailValidator';
import {
  getAllCoordinators,
  addCoordinator,
  deleteCoordinator,
  Coordinator,
} from '@/lib/services/coordinatorService';

export default function AdminManageCoordinatorsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [coordinators, setCoordinators] = useState<Coordinator[]>([]);
  const [emailInput, setEmailInput] = useState('');
  const [roleInput, setRoleInput] = useState<'coordinator' | 'admin'>('coordinator');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loadingCoordinators, setLoadingCoordinators] = useState(true);

  // Route guard: only admins can view this page
  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.replace('/login');
      } else if (!isAdmin(user.email)) {
        router.replace('/login');
      }
    }
  }, [loading, user, router]);

  // Load coordinators list on mount
  useEffect(() => {
    const load = async () => {
      if (!user || !isAdmin(user.email)) return;

      try {
        const list = await getAllCoordinators();
        setCoordinators(list);
      } catch (e) {
        console.error('Failed to load coordinators:', e);
        setError('Failed to load coordinators.');
      } finally {
        setLoadingCoordinators(false);
      }
    };
    load();
  }, [user]);

  const handleAddCoordinator = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const email = emailInput.trim();

    if (!email) {
      setError('Please enter an email.');
      return;
    }

    if (!isKarunyaEmail(email)) {
      setError(
        'Email must be @karunya.edu, @karunya.edu.in, @kate.education, or @kate.academy.',
      );
      return;
    }

    if (!user?.uid) {
      setError('You must be logged in.');
      return;
    }

    setSubmitting(true);
    try {
      await addCoordinator(email, user.uid, roleInput);
      setSuccess(`Coordinator ${email} added/updated successfully.`);
      setEmailInput('');

      const list = await getAllCoordinators();
      setCoordinators(list);
    } catch (err) {
      console.error('Add coordinator error:', err);
      setError('Failed to add coordinator. Check permissions.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (email: string) => {
    if (
      !confirm(
        `Remove coordinator ${email}? This will prevent them from logging in.`,
      )
    )
      return;

    setError('');
    setSuccess('');

    try {
      await deleteCoordinator(email);
      setSuccess('Coordinator removed successfully.');
      setCoordinators((prev) => prev.filter((c) => c.email !== email));
    } catch (err) {
      console.error('Delete coordinator error:', err);
      setError('Failed to remove coordinator. Check permissions.');
    }
  };

  if (loading || !user || !isAdmin(user.email)) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-9 w-9 border-2 border-sky-400 border-t-transparent mx-auto mb-3" />
          <p className="text-sm">Checking access…</p>
        </div>
      </div>
    );
  }


  return (
    <div className="space-y-8">
      {/* Page header */}
      <section>
        <h1 className="text-2xl sm:text-3xl font-semibold text-slate-50 tracking-tight">
          Manage Coordinators
        </h1>
        <p className="mt-1 text-sm text-slate-300">
          Add or remove coordinators. Only listed emails can access the attendance
          system.
        </p>
      </section>

      <div className="grid lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] gap-6 lg:gap-8 items-start">
        {/* Add Coordinator – left card */}
        <section>
          <div className="rounded-3xl bg-[radial-gradient(circle_at_top,_rgba(15,118,110,0.35),_rgba(15,23,42,0.98))] border border-teal-400/50 shadow-[0_22px_80px_rgba(0,0,0,0.95)] px-6 py-6 sm:px-7 sm:py-7">
            <h2 className="text-lg sm:text-xl font-semibold text-slate-50 mb-4">
              Add New Coordinator
            </h2>

            {error && (
              <div className="mb-3 px-3 py-2 rounded-2xl bg-red-500/10 border border-red-500/50 text-xs text-red-100">
                {error}
              </div>
            )}

            {success && (
              <div className="mb-3 px-3 py-2 rounded-2xl bg-emerald-500/10 border border-emerald-500/50 text-xs text-emerald-100">
                {success}
              </div>
            )}

            <form onSubmit={handleAddCoordinator} className="space-y-4">
              <div>
                <label className="block text-[11px] font-medium mb-1.5 text-slate-100">
                  Email address
                </label>
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="name@karunya.edu"
                  className="w-full px-4 py-2.5 rounded-xl bg-black/40 border border-white/15 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-transparent"
                  disabled={submitting}
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium mb-1.5 text-slate-100">
                  Role
                </label>
                <div className="flex gap-1 rounded-xl bg-black/40 border border-white/15 p-1">
                  <button
                    type="button"
                    onClick={() => setRoleInput('coordinator')}
                    disabled={submitting}
                    className={`flex-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                      roleInput === 'coordinator'
                        ? 'bg-white text-slate-900 shadow-[0_10px_30px_rgba(0,0,0,0.8)]'
                        : 'text-slate-200 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    Coordinator
                  </button>
                  <button
                    type="button"
                    onClick={() => setRoleInput('admin')}
                    disabled={submitting}
                    className={`flex-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                      roleInput === 'admin'
                        ? 'bg-white text-slate-900 shadow-[0_1px_10px_rgba(0,0,0,0.8)]'
                        : 'text-slate-200 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    Admin
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting || !user?.uid}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-teal-400 to-sky-500 text-slate-900 text-sm font-semibold shadow-[0_1px_10px_rgba(45,212,191,0.6)] hover:from-teal-300 hover:to-sky-400 focus:outline-none focus:ring-2 focus:ring-teal-300/70 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
              >
                {submitting ? (
                  <>
                    <span className="animate-spin rounded-full h-4 w-4 border-2 border-slate-900 border-t-transparent" />
                    Saving…
                  </>
                ) : (
                  'Add Coordinator'
                )}
              </button>
            </form>

            <p className="mt-3 text-[11px] text-slate-300 text-center">
              Only Karunya domain emails are accepted.
            </p>
          </div>
        </section>

        {/* Coordinators table – right card */}
        <section>
          <div className="rounded-3xl bg-black/60 border border-white/10 backdrop-blur-2xl shadow-[0_22px_80px_rgba(0,0,0,0.95)] px-4 py-5 sm:px-6 sm:py-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-50">
                  Current Coordinators
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Showing up to 6 most recent coordinators.
                </p>
              </div>
              <span className="px-3 py-1 rounded-full bg-white/5 border border-white/15 text-[11px] text-slate-200">
                {coordinators.length} total
              </span>
            </div>

            {loadingCoordinators ? (
              <div className="flex items-center justify-center py-10">
                <div className="animate-spin rounded-full h-7 w-7 border-2 border-sky-400 border-t-transparent" />
                <span className="ml-3 text-sm text-slate-300">Loading…</span>
              </div>
            ) : coordinators.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-sm">
                <p className="mb-1">No coordinators yet.</p>
                <p>Add your first coordinator using the form above.</p>
              </div>
            ) : (
              // scrollable area with custom dark scrollbar
              <div className="max-h-[320px] overflow-y-auto overflow-x-auto rounded-2xl border border-white/5
                              scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent hover:scrollbar-thumb-slate-400">
                <table className="w-full text-xs sm:text-sm">
                  <thead className="bg-white/5 sticky top-0 backdrop-blur-2xl">
                    <tr className="border-b border-white/10">
                      <th className="py-3 px-3 sm:px-4 text-left font-semibold text-slate-300">
                        Email
                      </th>
                      <th className="py-3 px-3 sm:px-4 text-left font-semibold text-slate-300 w-28">
                        Role
                      </th>
                      <th className="py-3 px-3 sm:px-4 text-left font-semibold text-slate-300 w-28">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {coordinators.map((coord) => (
                      <tr
                        key={coord.email}
                        className="border-b border-white/5 hover:bg-white/5 transition-colors"
                      >
                        <td className="py-3 px-3 sm:px-4 font-medium text-slate-100">
                          {coord.email}
                        </td>
                        <td className="py-3 px-3 sm:px-4">
                          <span
                            className={`inline-flex px-3 py-1 rounded-full text-[10px] sm:text-xs font-medium ${
                              coord.role === 'admin'
                                ? 'bg-purple-500/20 text-purple-200 border border-purple-400/40'
                                : 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40'
                            }`}
                          >
                            {coord.role}
                          </span>
                        </td>
                        <td className="py-3 px-3 sm:px-4">
                          <button
                            onClick={() => handleDelete(coord.email)}
                            className="px-3 py-1.5 rounded-2xl bg-red-500 text-white text-[10px] sm:text-xs font-medium border border-red-400/70 hover:bg-red-400 transition-colors"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
