// app/admin/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/app/context/AuthContext';
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
      setError('Email must be @karunya.edu, @karunya.edu.in, @kate.education, or @kate.academy.');
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

      // Refresh list
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
    if (!confirm(`Remove coordinator ${email}? This will prevent them from logging in.`)) return;

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

  // Loading or unauthorized
  if (loading || !user || !isAdmin(user.email)) {
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
    <div className="min-h-screen bg-slate-950 text-slate-50 p-6">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-100 mb-2">Manage Coordinators</h1>
        <p className="text-slate-400">
          Add or remove coordinators. Only listed emails can access the attendance system.
        </p>
      </div>
      

      {/* Add Coordinator Form */}
      <section className="max-w-lg mb-12">
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 shadow-xl">
          <h2 className="text-xl font-semibold mb-6 text-slate-100">Add New Coordinator</h2>

          {error && (
            <div className="mb-4 p-3 bg-red-900/50 border border-red-500 rounded-lg">
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 bg-emerald-900/50 border border-emerald-500 rounded-lg">
              <p className="text-emerald-300 text-sm">{success}</p>
            </div>
          )}

          <form onSubmit={handleAddCoordinator} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-slate-300">
                Email Address
              </label>
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                className="w-full px-4 py-3 bg-slate-800 border border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                placeholder="name@karunya.edu"
                disabled={submitting}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 text-slate-300">Role</label>
              <select
                value={roleInput}
                onChange={(e) => setRoleInput(e.target.value as 'coordinator' | 'admin')}
                className="w-full px-4 py-3 bg-slate-800 border border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                disabled={submitting}
              >
                <option value="coordinator">Coordinator</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={submitting || !user?.uid}
              className="w-full px-6 py-3 bg-gradient-to-r from-amber-500 to-amber-600 text-slate-900 font-semibold rounded-lg text-sm shadow-lg hover:from-amber-600 hover:to-amber-700 focus:outline-none focus:ring-4 focus:ring-amber-500/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {submitting ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-slate-900 inline-block mr-2"></div>
                  Saving...
                </>
              ) : (
                'Add Coordinator'
              )}
            </button>
          </form>

          <p className="mt-4 text-xs text-slate-500 text-center">
            Only Karunya/KATE domain emails accepted
          </p>
        </div>
      </section>

      {/* Coordinators Table */}
      <section>
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 shadow-xl">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-slate-100">Current Coordinators</h2>
            <span className="text-sm text-slate-400">
              {coordinators.length} total
            </span>
          </div>

          {loadingCoordinators ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
              <span className="ml-3 text-slate-400">Loading...</span>
            </div>
          ) : coordinators.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <p className="text-lg mb-2">No coordinators yet</p>
              <p className="text-sm">Add your first coordinator above</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="py-4 px-6 text-left font-semibold text-slate-300">Email</th>
                    <th className="py-4 px-6 text-left font-semibold text-slate-300 w-32">Role</th>
                    <th className="py-4 px-6 text-left font-semibold text-slate-300 w-32">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {coordinators.map((coord) => (
                    <tr key={coord.email} className="border-b border-slate-800 hover:bg-slate-850">
                      <td className="py-4 px-6 font-medium text-slate-200">{coord.email}</td>
                      <td className="py-4 px-6">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          coord.role === 'admin'
                            ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                            : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        }`}>
                          {coord.role}
                        </span>
                      </td>
                      <td className="py-4 px-6">
                        <button
                          onClick={() => handleDelete(coord.email)}
                          className="px-4 py-1.5 bg-red-600/80 hover:bg-red-600 text-white text-xs font-medium rounded-lg border border-red-500/50 transition-all duration-200 hover:shadow-md"
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
  );
}
