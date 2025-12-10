'use client';

import { useState, useCallback } from 'react';
import { useAuth } from '@/app/context/AuthContext';
import { useRouter } from 'next/navigation';
import { isAdmin } from '@/lib/utils/adminCheck';
import {
  bulkFetchStudentsByRegNos,
  bulkDeleteStudents,
  addOrUpdateStudent,
  Student,
  parseCSV,
} from '@/lib/services/studentService';
import { CategoryToggle } from './upload/page'; // Reuse your component

export default function BulkFetchStudentsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Core states
  const [step, setStep] = useState<'upload' | 'results' | 'loading'>('upload');
  const [csvRegNos, setCsvRegNos] = useState<string[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [notFoundRegNos, setNotFoundRegNos] = useState<string[]>([]);
  
  // Selection state
  const [selectedRegNos, setSelectedRegNos] = useState<Set<string>>(new Set());
  const [allSelected, setAllSelected] = useState(false);
  
  // UI states
  const [fetching, setFetching] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState<{ current: number; total: number; percent: number } | null>(null);
  const [editingRegNo, setEditingRegNo] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Student>({} as Student);
  
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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

  // === CSV UPLOAD ===
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');
    setSuccess('');
    
    try {
      const text = await file.text();
      const { headers, rows } = parseCSV(text);
      
      // Extract regNos (flexible column detection)
      const regNoColumn = headers.find(h => 
        /regno?|register|roll|id/i.test(h)
      ) || headers[0]; // fallback to first column
      
      const regNos = rows
        .map(row => row[regNoColumn]?.toString().trim())
        .filter(Boolean)
        .slice(0, 500); // Max 500 for performance
      
      if (regNos.length === 0) {
        setError('No valid registration numbers found in CSV');
        return;
      }
      
      setCsvRegNos(regNos);
      setStep('loading');
      
      // Fetch students
      const { found, notFound } = await bulkFetchStudentsByRegNos(regNos);
      setStudents(found);
      setNotFoundRegNos(notFound);
      
      if (found.length > 0) {
        setStep('results');
        setSuccess(`✅ Found ${found.length}/${regNos.length} students`);
      } else {
        setError(`❌ No students found for these regNos`);
        setStep('upload');
      }
      
    } catch (err: any) {
      setError(`Failed to parse CSV: ${err.message}`);
      setStep('upload');
    }
    
    e.target.value = '';
  };

  // === SELECTION ===
  const toggleAll = () => {
    if (allSelected) {
      setSelectedRegNos(new Set());
    } else {
      setSelectedRegNos(new Set(students.map(s => s.regNo!)));
    }
    setAllSelected(!allSelected);
  };

  const toggleStudent = (regNo: string) => {
    const newSelected = new Set(selectedRegNos);
    if (newSelected.has(regNo)) {
      newSelected.delete(regNo);
    } else {
      newSelected.add(regNo);
    }
    setSelectedRegNos(newSelected);
    setAllSelected(newSelected.size === students.length && students.length > 0);
  };

  const selectedCount = selectedRegNos.size;
  const hasSelection = selectedCount > 0;

  // === BULK DELETE ===
  const handleBulkDelete = async () => {
    if (!confirm(`Delete ${selectedCount} selected students permanently?`)) return;
    
    setDeleting(true);
    setDeleteProgress(null);
    setError('');

    try {
      const regNosArray = Array.from(selectedRegNos);
      const result = await bulkDeleteStudents(regNosArray, (progress) => {
        setDeleteProgress(progress);
      });

      setSuccess(`${result.success} students deleted successfully`);
      
      // Remove deleted from list
      setStudents(students.filter(s => !selectedRegNos.has(s.regNo!)));
      setSelectedRegNos(new Set());
      setAllSelected(false);
      
    } catch (err: any) {
      setError(`Bulk delete failed: ${err.message}`);
    } finally {
      setDeleting(false);
      setDeleteProgress(null);
    }
  };

  // === EDIT ===
  const startEdit = (student: Student) => {
    setEditingRegNo(student.regNo);
    setEditForm({ ...student });
  };

  const saveEdit = async () => {
    if (!editForm.regNo || !editForm.name) return;
    
    try {
      await addOrUpdateStudent(editForm, user!.uid);
      setStudents(students.map(s => 
        s.regNo === editForm.regNo ? editForm : s
      ));
      setEditingRegNo(null);
      setSuccess('Student updated successfully');
    } catch (err: any) {
      setError(`Update failed: ${err.message}`);
    }
  };

  const cancelEdit = () => {
    setEditingRegNo(null);
  };

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-slate-50">
            Bulk Fetch & Manage Students
          </h1>
          <p className="mt-1 text-sm text-slate-300">
            Upload regNos → fetch → edit/delete individually or in bulk
          </p>
        </div>
        {step === 'results' && (
          <button
            onClick={() => router.push('/admin/students')}
            className="px-4 py-2 rounded-xl bg-black/40 border border-white/15 text-sm text-slate-100 hover:bg-white/5"
          >
            ← Back to Students
          </button>
        )}
      </div>

      {/* Messages */}
      {error && (
        <div className="rounded-2xl bg-red-500/10 border border-red-500/40 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/40 px-4 py-3 text-sm text-emerald-100">
          {success}
        </div>
      )}

      {/* === UPLOAD STEP === */}
      {step === 'upload' && (
        <div className="rounded-3xl bg-black/60 border border-white/10 backdrop-blur-2xl px-8 py-10 shadow-[0_18px_60px_rgba(0,0,0,0.9)] text-center">
          <div className="animate-pulse text-4xl mb-6">📋</div>
          <h2 className="text-xl sm:text-2xl font-semibold text-slate-50 mb-4">
            Upload Registration Numbers
          </h2>
          <p className="text-slate-300 mb-8 max-w-md mx-auto">
            CSV with single column of regNos (max 500 rows). Auto-detects "regNo", "register", etc.
          </p>
          <div className="max-w-md mx-auto">
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              disabled={fetching}
              className="block w-full text-sm file:mr-4 file:py-3 file:px-6 file:rounded-xl file:border-0 file:bg-gradient-to-r file:from-teal-400 file:to-sky-500 file:text-slate-900 file:font-semibold hover:file:from-teal-300 hover:file:to-sky-400 cursor-pointer bg-black/30 border border-white/10 rounded-2xl px-4 py-4 text-slate-200"
            />
            <p className="mt-3 text-xs text-slate-400">
              Example: <code className="bg-slate-800 px-2 py-1 rounded text-xs">regNo\n21BECE1001\n21BECE1002</code>
            </p>
          </div>
        </div>
      )}

      {/* === LOADING STEP === */}
      {step === 'loading' && (
        <div className="flex items-center justify-center py-20 text-slate-100">
          <div className="text-center space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-2 border-sky-400 border-t-transparent mx-auto" />
            <p className="text-lg">Fetching {csvRegNos.length} students...</p>
            <p className="text-sm text-slate-400">This takes ~2-3 seconds</p>
          </div>
        </div>
      )}

      {/* === RESULTS STEP === */}
      {step === 'results' && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/40 p-4 text-emerald-100">
              <div className="text-2xl font-bold">{students.length}</div>
              <div className="text-sm opacity-90">Found Students</div>
            </div>
            <div className="rounded-2xl bg-red-500/10 border border-red-500/40 p-4 text-red-100">
              <div className="text-2xl font-bold">{notFoundRegNos.length}</div>
              <div className="text-sm opacity-90">Not Found</div>
            </div>
            <div className="rounded-2xl bg-sky-500/10 border border-sky-500/40 p-4 text-sky-100">
              <div className="text-2xl font-bold">{selectedCount}</div>
              <div className="text-sm opacity-90">Selected</div>
            </div>
          </div>

          {/* Bulk Actions */}
          {hasSelection && (
            <div className="rounded-2xl bg-slate-800/50 border border-slate-600/50 p-4 flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium text-slate-200">
                {selectedCount} {selectedCount === 1 ? 'student' : 'students'} selected
              </span>
              <button
                onClick={handleBulkDelete}
                disabled={deleting}
                className="px-4 py-2 rounded-xl bg-red-500/90 hover:bg-red-400 text-slate-900 font-semibold text-sm shadow-lg transition-all disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : `🗑️ Delete Selected`}
              </button>
              <button
                onClick={() => {
                  setSelectedRegNos(new Set());
                  setAllSelected(false);
                }}
                className="px-4 py-2 rounded-xl bg-slate-700/50 border border-slate-500/50 hover:bg-slate-600 text-sm text-slate-200 transition-all"
              >
                Clear Selection
              </button>
            </div>
          )}

          {/* Delete Progress */}
          {deleteProgress && (
            <div className="rounded-2xl bg-red-500/10 border border-red-500/40 px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-red-100">Deleting {deleteProgress.current}/{deleteProgress.total}</span>
                <span className="font-semibold text-red-100">{deleteProgress.percent}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-800">
                <div
                  className="h-2 rounded-full bg-red-500 transition-all duration-300"
                  style={{ width: `${deleteProgress.percent}%` }}
                />
              </div>
            </div>
          )}

          {/* Students Table */}
          <div className="rounded-3xl bg-black/60 border border-white/10 backdrop-blur-2xl overflow-hidden shadow-[0_18px_60px_rgba(0,0,0,0.9)]">
            <div className="overflow-x-auto">
              <table className="w-full text-xs sm:text-sm">
                <thead className="bg-black/20 border-b border-white/10">
                  <tr>
                    <th className="px-4 py-4 text-left">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        className="w-4 h-4 rounded text-teal-500 focus:ring-teal-400"
                      />
                    </th>
                    <th className="px-4 py-4 font-semibold text-slate-200 w-28">RegNo</th>
                    <th className="px-4 py-4 font-semibold text-slate-200">Name</th>
                    <th className="px-4 py-4 font-semibold text-slate-200 hidden md:table-cell">Committee</th>
                    <th className="px-4 py-4 font-semibold text-slate-200 hidden lg:table-cell">Hostel</th>
                    <th className="px-4 py-4 font-semibold text-slate-200 hidden xl:table-cell">Room</th>
                    <th className="px-4 py-4 font-semibold text-slate-200 hidden 2xl:table-cell">Phone</th>
                    <th className="px-4 py-4 font-semibold text-slate-200 hidden lg:table-cell">Dept</th>
                    <th className="px-4 py-4 font-semibold text-slate-200">Category</th>
                    <th className="px-4 py-4 font-semibold text-slate-200 w-24">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {students.map((student) => {
                    const isEditing = editingRegNo === student.regNo;
                    const hasOd = student.categories?.od;
                    const hasScholarship = student.categories?.scholarship;
                    
                    return (
                      <tr key={student.regNo} className="hover:bg-white/5 transition-colors">
                        <td className="px-4 py-4">
                          <input
                            type="checkbox"
                            checked={selectedRegNos.has(student.regNo!)}
                            onChange={() => toggleStudent(student.regNo!)}
                            className="w-4 h-4 rounded text-teal-500 focus:ring-teal-400"
                          />
                        </td>
                        <td className="px-4 py-4 font-mono text-slate-200 font-semibold">
                          {student.regNo}
                        </td>
                        
                        {/* Name - Editable */}
                        <td className="px-4 py-4">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editForm.name || ''}
                              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                              className="w-full px-2 py-1 bg-black/50 border border-white/20 rounded text-slate-200 focus:ring-2 focus:ring-teal-400 focus:border-transparent"
                              autoFocus
                            />
                          ) : (
                            <span className="text-slate-200">{student.name}</span>
                          )}
                        </td>

                        {/* Committee */}
                        <td className="px-4 py-4 hidden md:table-cell">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editForm.committee || ''}
                              onChange={(e) => setEditForm({ ...editForm, committee: e.target.value })}
                              className="w-full px-2 py-1 bg-black/50 border border-white/20 rounded text-slate-200 focus:ring-2 focus:ring-teal-400"
                            />
                          ) : (
                            student.committee || '—'
                          )}
                        </td>

                        {/* Other fields (similar pattern) */}
                        <td className="px-4 py-4 hidden lg:table-cell">{student.hostel || '—'}</td>
                        <td className="px-4 py-4 hidden xl:table-cell">{student.roomNumber || '—'}</td>
                        <td className="px-4 py-4 hidden 2xl:table-cell">{student.phoneNumber || '—'}</td>
                        <td className="px-4 py-4 hidden lg:table-cell">{student.department || '—'}</td>

                        {/* Category Badges */}
                        <td className="px-4 py-4">
                          <div className="flex gap-1">
                            {hasOd && (
                              <span className="px-2 py-1 bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-xs rounded-full font-medium">
                                🟢 OD
                              </span>
                            )}
                            {hasScholarship && (
                              <span className="px-2 py-1 bg-sky-500/20 border border-sky-500/40 text-sky-400 text-xs rounded-full font-medium">
                                🔵 Scholarship
                              </span>
                            )}
                            {!hasOd && !hasScholarship && (
                              <span className="px-2 py-1 bg-slate-500/20 border border-slate-500/40 text-slate-400 text-xs rounded-full">
                                ⚪ None
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-4">
                          <div className="flex gap-1">
                            {isEditing ? (
                              <>
                                <button
                                  onClick={saveEdit}
                                  className="p-1.5 bg-emerald-500/90 hover:bg-emerald-400 text-slate-900 rounded-lg text-xs font-semibold shadow-md transition-all"
                                  title="Save"
                                >
                                  💾
                                </button>
                                <button
                                  onClick={cancelEdit}
                                  className="p-1.5 bg-slate-600/50 hover:bg-slate-500 text-slate-200 rounded-lg text-xs transition-all"
                                  title="Cancel"
                                >
                                  ❌
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => startEdit(student)}
                                  className="p-1.5 bg-teal-500/90 hover:bg-teal-400 text-slate-900 rounded-lg text-xs font-semibold shadow-md transition-all"
                                  title="Edit"
                                >
                                  ✏️
                                </button>
                                <button
                                  onClick={() => {
                                    if (confirm(`Delete ${student.name}?`)) {
                                      // Single delete logic here
                                    }
                                  }}
                                  className="p-1.5 ml-1 bg-red-500/90 hover:bg-red-400 text-slate-900 rounded-lg text-xs font-semibold shadow-md transition-all"
                                  title="Delete"
                                >
                                  🗑️
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Not Found List */}
          {notFoundRegNos.length > 0 && (
            <div className="rounded-2xl bg-red-500/5 border border-red-500/20 p-4">
              <h3 className="font-semibold text-red-100 mb-2">Not Found ({notFoundRegNos.length})</h3>
              <div className="flex flex-wrap gap-2 text-xs text-red-300">
                {notFoundRegNos.map(regNo => (
                  <span key={regNo} className="px-2 py-1 bg-red-500/20 rounded-full font-mono">
                    {regNo}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
