// app/students/all/page.tsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import { getAllStudents, advancedSearchStudents, Student } from '@/lib/services/studentService';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function AllStudentsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [students, setStudents] = useState<Student[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [searchField, setSearchField] = useState<'all' | 'regNo' | 'name' | 'committee' | 'department' | 'hostel' | 'phone'>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'od' | 'scholarship' | 'none'>('all');
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  
  // Sort states
  const [sortField, setSortField] = useState<keyof Student>('regNo');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Selection state
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [selectAllPages, setSelectAllPages] = useState(false);

  // Export loading state
  const [exporting, setExporting] = useState(false);

  // Edit state
  const [editingRegNo, setEditingRegNo] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Student>({} as Student);

  // Fetch all students on mount
  useEffect(() => {
    fetchStudents();
  }, []);

  const fetchStudents = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAllStudents();
      setStudents(data);
      setFilteredStudents(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch students');
    } finally {
      setLoading(false);
    }
  };

  // Apply filters and search
  useEffect(() => {
    const applyFilters = async () => {
      if (searchQuery.trim() || categoryFilter !== 'all') {
        const results = await advancedSearchStudents({
          searchField,
          searchQuery,
          categoryFilter,
        });
        setFilteredStudents(results);
      } else {
        setFilteredStudents(students);
      }
      setCurrentPage(1);
      setSelectAllPages(false);
      setSelectedStudents(new Set());
    };

    applyFilters();
  }, [searchQuery, searchField, categoryFilter, students]);

  // Sort students
  const sortedStudents = useMemo(() => {
    const sorted = [...filteredStudents].sort((a, b) => {
      const aValue = a[sortField] || '';
      const bValue = b[sortField] || '';
      
      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [filteredStudents, sortField, sortDirection]);

  // Paginate students
  const paginatedStudents = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return sortedStudents.slice(startIndex, endIndex);
  }, [sortedStudents, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(sortedStudents.length / itemsPerPage);

  // Handle sort
  const handleSort = (field: keyof Student) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Handle select all across all pages
  const handleSelectAllPages = () => {
    if (selectAllPages) {
      setSelectedStudents(new Set());
      setSelectAllPages(false);
    } else {
      const allRegNos = sortedStudents.map(s => s.regNo);
      setSelectedStudents(new Set(allRegNos));
      setSelectAllPages(true);
    }
  };

  // Handle select all on current page
  const handleSelectCurrentPage = () => {
    const currentPageRegNos = paginatedStudents.map(s => s.regNo);
    const allSelected = currentPageRegNos.every(regNo => selectedStudents.has(regNo));
    
    const newSelected = new Set(selectedStudents);
    
    if (allSelected) {
      currentPageRegNos.forEach(regNo => newSelected.delete(regNo));
    } else {
      currentPageRegNos.forEach(regNo => newSelected.add(regNo));
    }
    
    setSelectedStudents(newSelected);
    
    if (newSelected.size === sortedStudents.length) {
      setSelectAllPages(true);
    } else {
      setSelectAllPages(false);
    }
  };

  // Handle individual selection
  const handleSelectStudent = (regNo: string) => {
    const newSelected = new Set(selectedStudents);
    if (newSelected.has(regNo)) {
      newSelected.delete(regNo);
    } else {
      newSelected.add(regNo);
    }
    setSelectedStudents(newSelected);
    
    if (newSelected.size === sortedStudents.length) {
      setSelectAllPages(true);
    } else {
      setSelectAllPages(false);
    }
  };

  // Export to CSV
  const exportToCSV = () => {
    const headers = ['Reg No', 'Name', 'Committee', 'Hostel', 'Room No', 'Phone', 'Department', 'OD', 'Scholarship'];
    const csvRows = [headers.join(',')];
    
    const dataToExport = selectedStudents.size > 0 
      ? sortedStudents.filter(s => selectedStudents.has(s.regNo))
      : sortedStudents;
    
    dataToExport.forEach(student => {
      const row = [
        student.regNo,
        `"${student.name}"`,
        student.committee || '',
        student.hostel || '',
        student.roomNumber || '',
        student.phoneNumber || '',
        student.department || '',
        student.categories?.od ? 'Yes' : 'No',
        student.categories?.scholarship ? 'Yes' : 'No',
      ];
      csvRows.push(row.join(','));
    });
    
    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `students_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export to PDF
  const exportToPDF = () => {
    setExporting(true);
    
    try {
      const doc = new jsPDF('l', 'mm', 'a4');
      
      const dataToExport = selectedStudents.size > 0 
        ? sortedStudents.filter(s => selectedStudents.has(s.regNo))
        : sortedStudents;
      
      doc.setFontSize(16);
      doc.text('Student Database Report', 14, 15);
      
      doc.setFontSize(10);
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 22);
      doc.text(`Total Students: ${dataToExport.length}`, 14, 27);
      if (selectedStudents.size > 0) {
        doc.text(`(Selected: ${selectedStudents.size} students)`, 14, 32);
      }
      
      const tableHeaders = [
        'Reg No',
        'Name',
        'Committee',
        'Hostel',
        'Room',
        'Phone',
        'Department',
        'Categories'
      ];
      
      const tableData = dataToExport.map(student => [
        student.regNo,
        student.name,
        student.committee || '-',
        student.hostel || '-',
        student.roomNumber || '-',
        student.phoneNumber || '-',
        student.department || '-',
        [
          student.categories?.od ? 'OD' : '',
          student.categories?.scholarship ? 'Scholar' : ''
        ].filter(Boolean).join(', ') || '-'
      ]);
      
      autoTable(doc, {
        head: [tableHeaders],
        body: tableData,
        startY: selectedStudents.size > 0 ? 37 : 32,
        theme: 'striped',
        headStyles: {
          fillColor: [59, 130, 246],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          halign: 'center'
        },
        styles: {
          fontSize: 8,
          cellPadding: 2,
        },
        columnStyles: {
          0: { cellWidth: 25 },
          1: { cellWidth: 40 },
          2: { cellWidth: 25 },
          3: { cellWidth: 25 },
          4: { cellWidth: 15 },
          5: { cellWidth: 25 },
          6: { cellWidth: 30 },
          7: { cellWidth: 25 },
        },
        didDrawPage: (data) => {
          const pageCount = doc.internal.pages.length - 1;
          const pageSize = doc.internal.pageSize;
          const pageHeight = pageSize.height ? pageSize.height : pageSize.getHeight();
          doc.setFontSize(8);
          doc.text(
            `Page ${data.pageNumber} of ${pageCount}`,
            data.settings.margin.left,
            pageHeight - 10
          );
        }
      });
      
      doc.save(`students_${new Date().toISOString().split('T')[0]}.pdf`);
      setSuccess('✅ PDF exported successfully');
    } catch (err) {
      console.error('PDF export error:', err);
      setError('Failed to export PDF. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  // Edit functions
  const startEdit = (student: Student) => {
    setEditingRegNo(student.regNo);
    setEditForm({ ...student });
  };

  const saveEdit = async () => {
    if (!editForm.regNo || !editForm.name) return;
    
    try {
      const { addOrUpdateStudent } = await import('@/lib/services/studentService');
      await addOrUpdateStudent(editForm, user!.uid);
      
      setStudents(students.map(s => 
        s.regNo === editForm.regNo ? editForm : s
      ));
      setFilteredStudents(filteredStudents.map(s => 
        s.regNo === editForm.regNo ? editForm : s
      ));
      setEditingRegNo(null);
      setSuccess('✅ Student updated successfully');
    } catch (err: any) {
      setError(`Update failed: ${err.message}`);
    }
  };

  const cancelEdit = () => {
    setEditingRegNo(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-sky-400 border-t-transparent mx-auto mb-3" />
          <p className="text-sm">Loading students...</p>
        </div>
      </div>
    );
  }

  const currentPageAllSelected = paginatedStudents.every(s => selectedStudents.has(s.regNo));

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-slate-50">
            📚 All Students Database
          </h1>
          <p className="mt-1 text-sm text-slate-300">
            Total: {sortedStudents.length} students
            {selectedStudents.size > 0 && (
              <span className="ml-2 text-sky-400 font-semibold">
                • {selectedStudents.size} selected{selectAllPages ? ' (All Pages)' : ''}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => router.push('/admin/students')}
          className="px-4 py-2 rounded-xl bg-black/40 border border-white/15 text-sm text-slate-100 hover:bg-white/5 transition-all"
        >
          ← Back
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

      {/* Filters */}
      <div className="rounded-3xl bg-black/60 border border-white/10 backdrop-blur-2xl px-8 py-6 shadow-[0_18px_60px_rgba(0,0,0,0.9)]">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          {/* Search Field Selector */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Search In
            </label>
            <select
              value={searchField}
              onChange={(e) => setSearchField(e.target.value as any)}
              className="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/20 text-slate-100 focus:ring-2 focus:ring-teal-400 focus:border-transparent"
            >
              <option value="all">All Fields</option>
              <option value="regNo">Registration No</option>
              <option value="name">Name</option>
              <option value="committee">Committee</option>
              <option value="department">Department</option>
              <option value="hostel">Hostel</option>
              <option value="phone">Phone Number</option>
            </select>
          </div>

          {/* Search Query */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Search Query
            </label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Enter search term..."
              className="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/20 text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-teal-400 focus:border-transparent"
            />
          </div>

          {/* Category Filter */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Category
            </label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as any)}
              className="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/20 text-slate-100 focus:ring-2 focus:ring-teal-400 focus:border-transparent"
            >
              <option value="all">All Categories</option>
              <option value="od">OD Students</option>
              <option value="scholarship">Scholarship Students</option>
              <option value="none">No Category</option>
            </select>
          </div>

          {/* Items Per Page */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Items Per Page
            </label>
            <select
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/20 text-slate-100 focus:ring-2 focus:ring-teal-400 focus:border-transparent"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={sortedStudents.length}>All ({sortedStudents.length})</option>
            </select>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={fetchStudents}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-teal-400 to-sky-500 text-slate-900 font-semibold hover:from-teal-300 hover:to-sky-400 shadow-lg transition-all"
          >
            🔄 Refresh Data
          </button>
          
          <button
            onClick={handleSelectAllPages}
            className={`px-6 py-3 rounded-xl font-semibold shadow-lg transition-all ${
              selectAllPages 
                ? 'bg-orange-500/90 hover:bg-orange-400 text-slate-900' 
                : 'bg-purple-500/90 hover:bg-purple-400 text-slate-900'
            }`}
          >
            {selectAllPages ? '✓ All Selected (Deselect)' : '☑ Select All Pages'}
          </button>
          
          <button
            onClick={exportToCSV}
            disabled={exporting}
            className="px-6 py-3 rounded-xl bg-emerald-500/90 hover:bg-emerald-400 text-slate-900 font-semibold shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            📥 Export {selectedStudents.size > 0 ? `(${selectedStudents.size})` : 'All'} CSV
          </button>
          
          <button
            onClick={exportToPDF}
            disabled={exporting}
            className="px-6 py-3 rounded-xl bg-red-500/90 hover:bg-red-400 text-slate-900 font-semibold shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {exporting ? '⏳ Generating...' : `📄 Export ${selectedStudents.size > 0 ? `(${selectedStudents.size})` : 'All'} PDF`}
          </button>
          
          {selectedStudents.size > 0 && (
            <button
              onClick={() => {
                setSelectedStudents(new Set());
                setSelectAllPages(false);
              }}
              className="px-6 py-3 rounded-xl bg-slate-700/50 border border-slate-500/50 hover:bg-slate-600 text-slate-200 font-semibold transition-all"
            >
              ✕ Clear Selection
            </button>
          )}
        </div>
      </div>

      {/* Selection Info Banner */}
      {selectAllPages && (
        <div className="rounded-2xl bg-sky-500/10 border border-sky-500/40 p-4">
          <div className="flex items-center gap-3">
            <div className="text-2xl">ℹ️</div>
            <div>
              <p className="text-sm text-sky-100 font-medium">
                <strong>All {sortedStudents.length} students selected</strong> across all pages. 
                Export actions will include all selected students.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-3xl bg-black/60 border border-white/10 backdrop-blur-2xl overflow-hidden shadow-[0_18px_60px_rgba(0,0,0,0.9)]">
        <div className="overflow-x-auto">
          <table className="w-full text-xs sm:text-sm">
            <thead className="bg-black/20 border-b border-white/10">
              <tr>
                <th className="px-4 py-4 text-left w-12">
                  <input
                    type="checkbox"
                    checked={currentPageAllSelected && paginatedStudents.length > 0}
                    onChange={handleSelectCurrentPage}
                    className="w-4 h-4 rounded text-teal-500 focus:ring-teal-400"
                    title="Select all on this page"
                  />
                </th>
                <SortableHeader field="regNo" label="Reg No" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
                <SortableHeader field="name" label="Name" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
                <SortableHeader field="committee" label="Committee" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
                <th className="px-4 py-4 font-semibold text-slate-200 hidden lg:table-cell">Hostel</th>
                <th className="px-4 py-4 font-semibold text-slate-200 hidden xl:table-cell">Room</th>
                <th className="px-4 py-4 font-semibold text-slate-200 hidden lg:table-cell">Phone</th>
                <th className="px-4 py-4 font-semibold text-slate-200 hidden xl:table-cell">Department</th>
                <th className="px-4 py-4 font-semibold text-slate-200">Category</th>
                <th className="px-4 py-4 font-semibold text-slate-200">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {paginatedStudents.map((student) => {
                const isEditing = editingRegNo === student.regNo;
                const hasOd = student.categories?.od;
                const hasScholarship = student.categories?.scholarship;
                
                return (
                  <tr 
                    key={student.regNo}
                    className={`hover:bg-white/5 transition-colors ${selectedStudents.has(student.regNo) ? 'bg-sky-500/10' : ''}`}
                  >
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={selectedStudents.has(student.regNo)}
                        onChange={() => handleSelectStudent(student.regNo)}
                        className="w-4 h-4 rounded text-teal-500 focus:ring-teal-400"
                      />
                    </td>
                    <td className="px-4 py-4 font-mono text-slate-200 font-semibold">{student.regNo}</td>
                    
                    {/* Name */}
                    <td className="px-4 py-4">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editForm.name || ''}
                          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          className="w-full px-2 py-1 bg-black/50 border border-white/20 rounded text-slate-200 focus:ring-2 focus:ring-teal-400"
                          autoFocus
                        />
                      ) : (
                        <span className="text-slate-200">{student.name}</span>
                      )}
                    </td>

                    {/* Committee */}
                    <td className="px-4 py-4">
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

                    <td className="px-4 py-4 hidden lg:table-cell text-slate-300">{student.hostel || '—'}</td>
                    <td className="px-4 py-4 hidden xl:table-cell text-slate-300">{student.roomNumber || '—'}</td>
                    <td className="px-4 py-4 hidden lg:table-cell text-slate-300 font-mono">{student.phoneNumber || '—'}</td>
                    <td className="px-4 py-4 hidden xl:table-cell text-slate-300">{student.department || '—'}</td>

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
                            🔵 Scholar
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
                          <button
                            onClick={() => startEdit(student)}
                            className="p-1.5 bg-teal-500/90 hover:bg-teal-400 text-slate-900 rounded-lg text-xs font-semibold shadow-md transition-all"
                            title="Edit"
                          >
                            ✏️
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="bg-black/20 px-6 py-4 border-t border-white/10">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <p className="text-sm text-slate-300">
                  Showing <span className="font-medium text-slate-100">{(currentPage - 1) * itemsPerPage + 1}</span> to{' '}
                  <span className="font-medium text-slate-100">{Math.min(currentPage * itemsPerPage, sortedStudents.length)}</span> of{' '}
                  <span className="font-medium text-slate-100">{sortedStudents.length}</span> results
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="px-3 py-2 rounded-lg bg-black/30 border border-white/20 text-slate-200 hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  &laquo;
                </button>
                <button
                  onClick={() => setCurrentPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="px-3 py-2 rounded-lg bg-black/30 border border-white/20 text-slate-200 hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  &lsaquo;
                </button>
                
                {[...Array(Math.min(5, totalPages))].map((_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  
                  if (pageNum < 1 || pageNum > totalPages) return null;
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`px-4 py-2 rounded-lg font-medium transition-all ${
                        currentPage === pageNum
                          ? 'bg-gradient-to-r from-teal-400 to-sky-500 text-slate-900 shadow-lg'
                          : 'bg-black/30 border border-white/20 text-slate-200 hover:bg-white/5'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                
                <button
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="px-3 py-2 rounded-lg bg-black/30 border border-white/20 text-slate-200 hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  &rsaquo;
                </button>
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="px-3 py-2 rounded-lg bg-black/30 border border-white/20 text-slate-200 hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  &raquo;
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Sortable Header Component
interface SortableHeaderProps {
  field: keyof Student;
  label: string;
  sortField: keyof Student;
  sortDirection: 'asc' | 'desc';
  onSort: (field: keyof Student) => void;
}

function SortableHeader({ field, label, sortField, sortDirection, onSort }: SortableHeaderProps) {
  const isActive = sortField === field;
  
  return (
    <th 
      onClick={() => onSort(field)}
      className="px-4 py-4 font-semibold text-slate-200 cursor-pointer hover:bg-white/5 transition-colors"
    >
      <div className="flex items-center gap-2">
        {label}
        {isActive && (
          <span className="text-teal-400 font-bold">
            {sortDirection === 'asc' ? '↑' : '↓'}
          </span>
        )}
      </div>
    </th>
  );
}
