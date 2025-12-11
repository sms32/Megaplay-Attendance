'use client';

import { useState, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { isAdmin } from '@/lib/utils/adminCheck';
import {
  bulkFetchStudentsByRegNos,
  bulkDeleteStudents,
  addOrUpdateStudent,
  deleteStudent,
  advancedSearchStudents,
  getStudentAttendance,
  addAttendanceRecord,
  deleteAttendanceRecord,
  Student,
  StudentAttendance,
  AttendanceRecord,
  parseCSV,
} from '@/lib/services/studentService';
import { CategoryToggle } from '../students/page';


// Search filter interface
interface SearchFilters {
  searchField: 'all' | 'regNo' | 'name' | 'committee' | 'department' | 'hostel' | 'phone';
  searchQuery: string;
  categoryFilter: 'all' | 'od' | 'scholarship' | 'none';
}

export default function BulkFetchStudentsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Mode toggle
  const [searchMode, setSearchMode] = useState<'advanced' | 'bulk'>('advanced');

  // Core states (bulk)
  const [step, setStep] = useState<'upload' | 'results' | 'loading'>('upload');
  const [csvRegNos, setCsvRegNos] = useState<string[]>([]);
  const [bulkStudents, setBulkStudents] = useState<Student[]>([]);
  const [notFoundRegNos, setNotFoundRegNos] = useState<string[]>([]);
  
  // Advanced search states
  const [searchFilters, setSearchFilters] = useState<SearchFilters>({
    searchField: 'all',
    searchQuery: '',
    categoryFilter: 'all',
  });
  const [searchResults, setSearchResults] = useState<Student[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  
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

  const [attendanceModal, setAttendanceModal] = useState<{
    isOpen: boolean;
    student: Student | null;
    attendance: StudentAttendance | null;
  }>({
    isOpen: false,
    student: null,
    attendance: null,
  });
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [editingAttendance, setEditingAttendance] = useState<string | null>(null); // date being edited
  const [newAttendanceDate, setNewAttendanceDate] = useState('');
  const [newAttendanceStatus, setNewAttendanceStatus] = useState<'present' | 'absent' | 'od' | 'leave'>('present');
  const [newAttendanceRemarks, setNewAttendanceRemarks] = useState('');

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


  // === ADVANCED SEARCH ===
  const handleAdvancedSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    if (!searchFilters.searchQuery.trim() && searchFilters.categoryFilter === 'all') {
      setError('Please enter a search term or select a category filter');
      return;
    }
    
    setIsSearching(true);
    setError('');
    setSuccess('');
    setHasSearched(false);
    
    try {
      const results = await advancedSearchStudents(searchFilters);
      setSearchResults(results);
      setHasSearched(true);
      
      if (results.length > 0) {
        setSuccess(`✅ Found ${results.length} student${results.length === 1 ? '' : 's'}`);
      } else {
        setError('❌ No students found matching your criteria');
      }
    } catch (err: any) {
      setError(`Search failed: ${err.message}`);
    } finally {
      setIsSearching(false);
    }
  };

  const clearSearch = () => {
    setSearchFilters({
      searchField: 'all',
      searchQuery: '',
      categoryFilter: 'all',
    });
    setSearchResults([]);
    setHasSearched(false);
    setError('');
    setSuccess('');
  };

  // Edit/Delete for search results
  const startSearchEdit = (student: Student) => {
    setEditingRegNo(student.regNo);
    setEditForm({ ...student });
  };

  const saveSearchEdit = async () => {
    if (!editForm.regNo || !editForm.name) return;
    
    try {
      await addOrUpdateStudent(editForm, user!.uid);
      setSearchResults(searchResults.map(s => 
        s.regNo === editForm.regNo ? editForm : s
      ));
      setEditingRegNo(null);
      setSuccess('✅ Student updated successfully');
    } catch (err: any) {
      setError(`Update failed: ${err.message}`);
    }
  };

  const cancelSearchEdit = () => {
    setEditingRegNo(null);
  };

  const deleteSearchStudent = async (student: Student) => {
    if (!confirm(`Delete ${student.name} (${student.regNo}) permanently?`)) return;
    
    try {
      await deleteStudent(student.regNo);
      setSearchResults(searchResults.filter(s => s.regNo !== student.regNo));
      setSuccess(`✅ ${student.name} deleted successfully`);
    } catch (err: any) {
      setError(`Delete failed: ${err.message}`);
    }
  };


  // === CSV UPLOAD (BULK) ===
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');
    setSuccess('');
    
    try {
      const text = await file.text();
      const { headers, rows } = parseCSV(text);
      
      const regNoColumn = headers.find(h => 
        /regno?|register|roll|id/i.test(h)
      ) || headers[0];
      
      const regNos = rows
        .map(row => row[regNoColumn]?.toString().trim())
        .filter(Boolean)
        .slice(0, 500);
      
      if (regNos.length === 0) {
        setError('No valid registration numbers found in CSV');
        return;
      }
      
      setCsvRegNos(regNos);
      setStep('loading');
      
      const { found, notFound } = await bulkFetchStudentsByRegNos(regNos);
      setBulkStudents(found);
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


  // === SELECTION (works for both modes) ===
  const currentStudents = searchMode === 'advanced' ? searchResults : bulkStudents;
  
  const toggleAll = () => {
    if (allSelected) {
      setSelectedRegNos(new Set());
    } else {
      setSelectedRegNos(new Set(currentStudents.map(s => s.regNo!)));
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
    setAllSelected(newSelected.size === currentStudents.length && currentStudents.length > 0);
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
      
      if (searchMode === 'advanced') {
        setSearchResults(searchResults.filter(s => !selectedRegNos.has(s.regNo!)));
      } else {
        setBulkStudents(bulkStudents.filter(s => !selectedRegNos.has(s.regNo!)));
      }
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
      
      if (searchMode === 'advanced') {
        setSearchResults(searchResults.map(s => 
          s.regNo === editForm.regNo ? editForm : s
        ));
      } else {
        setBulkStudents(bulkStudents.map(s => 
          s.regNo === editForm.regNo ? editForm : s
        ));
      }
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
            Student Search & Management
          </h1>
          <p className="mt-1 text-sm text-slate-300">
            Advanced search with filters or bulk fetch via CSV
          </p>
        </div>
        <button
          onClick={() => router.push('/admin/students')}
          className="px-4 py-2 rounded-xl bg-black/40 border border-white/15 text-sm text-slate-100 hover:bg-white/5"
        >
          ← Back to Students
        </button>
      </div>


      {/* Mode Toggle */}
      <div className="flex gap-3">
        <button
          onClick={() => {
            setSearchMode('advanced');
            setStep('upload');
            setError('');
            setSuccess('');
            setSelectedRegNos(new Set());
            setAllSelected(false);
          }}
          className={`px-6 py-3 rounded-xl font-semibold text-sm transition-all ${
            searchMode === 'advanced'
              ? 'bg-gradient-to-r from-teal-400 to-sky-500 text-slate-900 shadow-lg'
              : 'bg-black/40 border border-white/15 text-slate-300 hover:bg-white/5'
          }`}
        >
          🔍 Advanced Search
        </button>
        <button
          onClick={() => {
            setSearchMode('bulk');
            clearSearch();
            setSelectedRegNos(new Set());
            setAllSelected(false);
          }}
          className={`px-6 py-3 rounded-xl font-semibold text-sm transition-all ${
            searchMode === 'bulk'
              ? 'bg-gradient-to-r from-teal-400 to-sky-500 text-slate-900 shadow-lg'
              : 'bg-black/40 border border-white/15 text-slate-300 hover:bg-white/5'
          }`}
        >
          📋 Bulk Fetch (CSV)
        </button>
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


      {/* === ADVANCED SEARCH MODE === */}
      {searchMode === 'advanced' && (
        <div className="space-y-6">
          {/* Search Bar with Filters */}
          <div className="rounded-3xl bg-black/60 border border-white/10 backdrop-blur-2xl px-8 py-10 shadow-[0_18px_60px_rgba(0,0,0,0.9)]">
            <div className="text-center mb-6">
              <div className="text-4xl mb-4">🔍</div>
              <h2 className="text-xl sm:text-2xl font-semibold text-slate-50 mb-2">
                Advanced Student Search
              </h2>
              <p className="text-slate-300 text-sm">
                Search by any field or apply filters • Supports partial matches (e.g., "Sam" finds "Samuel", "Samantha")
              </p>
            </div>

            <form onSubmit={handleAdvancedSearch} className="max-w-4xl mx-auto space-y-4">
              {/* Search Field Selector + Input */}
              <div className="flex flex-col sm:flex-row gap-3">
                <select
                  value={searchFilters.searchField}
                  onChange={(e) => setSearchFilters({ ...searchFilters, searchField: e.target.value as any })}
                  className="px-4 py-4 rounded-xl bg-black/30 border border-white/20 text-slate-100 focus:ring-2 focus:ring-teal-400 focus:border-transparent text-base sm:w-48"
                >
                  <option value="all">All Fields</option>
                  <option value="regNo">Reg No</option>
                  <option value="name">Name</option>
                  <option value="committee">Committee</option>
                  <option value="department">Department</option>
                  <option value="hostel">Hostel</option>
                  <option value="phone">Phone Number</option>
                </select>

                <input
                  type="text"
                  value={searchFilters.searchQuery}
                  onChange={(e) => setSearchFilters({ ...searchFilters, searchQuery: e.target.value })}
                  placeholder="Enter search term (e.g., Sam, 21BECE, Dance, etc.)"
                  disabled={isSearching}
                  className="flex-1 px-6 py-4 rounded-xl bg-black/30 border border-white/20 text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-teal-400 focus:border-transparent text-base"
                />
              </div>

              {/* Category Filter */}
              <div className="flex flex-col sm:flex-row gap-3 items-center">
                <label className="text-slate-300 text-sm font-medium sm:w-48">
                  Category Filter:
                </label>
                <div className="flex gap-2 flex-wrap">
                  {(['all', 'od', 'scholarship', 'none'] as const).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSearchFilters({ ...searchFilters, categoryFilter: cat })}
                      className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                        searchFilters.categoryFilter === cat
                          ? 'bg-gradient-to-r from-teal-400 to-sky-500 text-slate-900 shadow-lg'
                          : 'bg-black/30 border border-white/20 text-slate-300 hover:bg-white/5'
                      }`}
                    >
                      {cat === 'all' && '🌐 All'}
                      {cat === 'od' && '🟢 OD Only'}
                      {cat === 'scholarship' && '🔵 Scholarship Only'}
                      {cat === 'none' && '⚪ No Category'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isSearching}
                  className="flex-1 px-8 py-4 rounded-xl bg-gradient-to-r from-teal-400 to-sky-500 text-slate-900 font-semibold hover:from-teal-300 hover:to-sky-400 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg transition-all"
                >
                  {isSearching ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-slate-900 border-t-transparent" />
                      Searching...
                    </span>
                  ) : (
                    '🔍 Search Students'
                  )}
                </button>
                <button
                  type="button"
                  onClick={clearSearch}
                  className="px-6 py-4 rounded-xl bg-slate-700/50 border border-slate-500/50 hover:bg-slate-600 text-slate-200 font-semibold transition-all"
                >
                  Clear
                </button>
              </div>
            </form>
          </div>

          {/* Search Results */}
          {hasSearched && searchResults.length > 0 && (
            <>
              {/* Results Summary */}
              <div className="rounded-2xl bg-gradient-to-r from-teal-500/20 to-sky-500/20 border border-teal-500/40 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-2xl font-bold text-slate-50">
                      {searchResults.length} Student{searchResults.length === 1 ? '' : 's'} Found
                    </h3>
                    <p className="text-slate-300 text-sm mt-1">
                      {searchFilters.searchQuery && `Searched for: "${searchFilters.searchQuery}" in ${searchFilters.searchField === 'all' ? 'all fields' : searchFilters.searchField}`}
                      {searchFilters.categoryFilter !== 'all' && ` • Filter: ${searchFilters.categoryFilter.toUpperCase()}`}
                    </p>
                  </div>
                  {hasSelection && (
                    <div className="text-right">
                      <div className="text-xl font-bold text-sky-400">{selectedCount} Selected</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Bulk Actions for Search Results */}
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

              {/* Results Table */}
              <StudentTable
                students={searchResults}
                selectedRegNos={selectedRegNos}
                allSelected={allSelected}
                editingRegNo={editingRegNo}
                editForm={editForm}
                onToggleAll={toggleAll}
                onToggleStudent={toggleStudent}
                onStartEdit={startEdit}
                onSaveEdit={saveEdit}
                onCancelEdit={cancelEdit}
                onDelete={deleteSearchStudent}
                setEditForm={setEditForm}
              />
            </>
          )}

          {/* No Results */}
          {hasSearched && searchResults.length === 0 && (
            <div className="rounded-2xl bg-slate-800/30 border border-slate-600/30 p-12 text-center">
              <div className="text-6xl mb-4">🔍</div>
              <h3 className="text-xl font-semibold text-slate-200 mb-2">No Students Found</h3>
              <p className="text-slate-400">Try adjusting your search criteria or filters</p>
            </div>
          )}
        </div>
      )}


      {/* === BULK MODE === */}
      {searchMode === 'bulk' && (
        <>
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
                  <div className="text-2xl font-bold">{bulkStudents.length}</div>
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

              <StudentTable
                students={bulkStudents}
                selectedRegNos={selectedRegNos}
                allSelected={allSelected}
                editingRegNo={editingRegNo}
                editForm={editForm}
                onToggleAll={toggleAll}
                onToggleStudent={toggleStudent}
                onStartEdit={startEdit}
                onSaveEdit={saveEdit}
                onCancelEdit={cancelEdit}
                onDelete={async (student) => {
                  try {
                    await deleteStudent(student.regNo);
                    setBulkStudents(bulkStudents.filter(s => s.regNo !== student.regNo));
                    setSuccess(`${student.name} deleted`);
                  } catch (err: any) {
                    setError(`Delete failed: ${err.message}`);
                  }
                }}
                setEditForm={setEditForm}
              />


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
        </>
      )}
    </div>
  );
}


// Reusable Student Table Component
interface StudentTableProps {
  students: Student[];
  selectedRegNos: Set<string>;
  allSelected: boolean;
  editingRegNo: string | null;
  editForm: Student;
  onToggleAll: () => void;
  onToggleStudent: (regNo: string) => void;
  onStartEdit: (student: Student) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: (student: Student) => void;
  setEditForm: (form: Student) => void;
}

function StudentTable({
  students,
  selectedRegNos,
  allSelected,
  editingRegNo,
  editForm,
  onToggleAll,
  onToggleStudent,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  setEditForm,
}: StudentTableProps) {
  return (
    <div className="rounded-3xl bg-black/60 border border-white/10 backdrop-blur-2xl overflow-hidden shadow-[0_18px_60px_rgba(0,0,0,0.9)]">
      <div className="overflow-x-auto">
        <table className="w-full text-xs sm:text-sm">
          <thead className="bg-black/20 border-b border-white/10">
            <tr>
              <th className="px-4 py-4 text-left w-12">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={onToggleAll}
                  className="w-4 h-4 rounded text-teal-500 focus:ring-teal-400"
                />
              </th>
              <th className="px-4 py-4 font-semibold text-slate-200 w-28">RegNo</th>
              <th className="px-4 py-4 font-semibold text-slate-200">Name</th>
              <th className="px-4 py-4 font-semibold text-slate-200 hidden md:table-cell w-32">Committee</th>
              <th className="px-4 py-4 font-semibold text-slate-200 hidden lg:table-cell w-24">Hostel</th>
              <th className="px-4 py-4 font-semibold text-slate-200 hidden xl:table-cell w-20">Room</th>
              <th className="px-4 py-4 font-semibold text-slate-200 hidden lg:table-cell w-36">Phone</th>
              <th className="px-4 py-4 font-semibold text-slate-200 hidden 2xl:table-cell w-32">Phone</th>
              <th className="px-4 py-4 font-semibold text-slate-200 hidden xl:table-cell w-28">Dept</th>
              <th className="px-4 py-4 font-semibold text-slate-200 w-28">Category</th>
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
                      onChange={() => onToggleStudent(student.regNo!)}
                      className="w-4 h-4 rounded text-teal-500 focus:ring-teal-400"
                    />
                  </td>
                  <td className="px-4 py-4 font-mono text-slate-200 font-semibold">
                    {student.regNo}
                  </td>
                  
                  {/* Name */}
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
                      <span className="text-slate-300">{student.committee || '—'}</span>
                    )}
                  </td>

                  {/* Hostel */}
                  <td className="px-4 py-4 hidden lg:table-cell text-slate-300">
                    {student.hostel || '—'}
                  </td>

                  {/* Room */}
                  <td className="px-4 py-4 hidden xl:table-cell text-slate-300">
                    {student.roomNumber || '—'}
                  </td>

                  {/* Phone Number - Now visible on lg+ screens */}
                  <td className="px-4 py-4 hidden lg:table-cell text-slate-300 font-mono">
                    {student.phoneNumber || '—'}
                  </td>
                  
                  {/* Phone Number - Always visible on 2xl+ screens */}
                  <td className="px-4 py-4 hidden 2xl:table-cell lg:hidden text-slate-300 font-mono">
                    {student.phoneNumber || '—'}
                  </td>

                  {/* Department */}
                  <td className="px-4 py-4 hidden xl:table-cell text-slate-300">
                    {student.department || '—'}
                  </td>

                  {/* Category */}
                  <td className="px-4 py-4">
                    <div className="flex gap-1 flex-wrap">
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
                            onClick={onSaveEdit}
                            className="p-1.5 bg-emerald-500/90 hover:bg-emerald-400 text-slate-900 rounded-lg text-xs font-semibold shadow-md transition-all"
                            title="Save"
                          >
                            💾
                          </button>
                          <button
                            onClick={onCancelEdit}
                            className="p-1.5 bg-slate-600/50 hover:bg-slate-500 text-slate-200 rounded-lg text-xs transition-all"
                            title="Cancel"
                          >
                            ❌
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => onStartEdit(student)}
                            className="p-1.5 bg-teal-500/90 hover:bg-teal-400 text-slate-900 rounded-lg text-xs font-semibold shadow-md transition-all"
                            title="Edit"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => onDelete(student)}
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
  );
}

