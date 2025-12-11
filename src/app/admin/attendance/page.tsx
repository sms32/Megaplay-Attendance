// app/admin/attendance/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { isAdmin } from '@/lib/utils/adminCheck';
import { getAttendanceAdmin, AttendanceRecord } from '@/lib/services/attendanceService';
import { getSessionConfig, SessionConfig } from '@/lib/services/sessionService';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const formatDateKey = (d: Date) => d.toISOString().split('T')[0];

// CSV Export (Name, RegNo, Committee, Category)
const buildCSV = (records: AttendanceRecord[]) => {
  const header = ['Name', 'Registration Number', 'Committee', 'Category'];

  const rows = records.map((r) => {
    return [
      r.studentName || '',
      r.regNo || '',
      r.committee || '',
      r.category || '',
    ]
      .map((v) => `"${(v ?? '').toString().replace(/"/g, '""')}"`)
      .join(',');
  });

  return [header.join(','), ...rows].join('\n');
};

const downloadCSV = (csv: string, filename: string) => {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

// Excel Export (Name, RegNo, Committee, Category)
const downloadExcel = (records: AttendanceRecord[], filename: string) => {
  const data = records.map((r) => ({
    Name: r.studentName || '',
    'Registration Number': r.regNo || '',
    Committee: r.committee || '',
    Category: r.category?.toUpperCase() || '',
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance');

  // Auto-width columns
  const maxWidths = [
    { wch: Math.max(20, ...data.map((d) => (d.Name || '').length)) },
    { wch: Math.max(20, ...data.map((d) => (d['Registration Number'] || '').length)) },
    { wch: Math.max(15, ...data.map((d) => (d.Committee || '').length)) },
    { wch: Math.max(12, ...data.map((d) => (d.Category || '').length)) },
  ];
  worksheet['!cols'] = maxWidths;

  XLSX.writeFile(workbook, filename);
};

// PDF Export (Name, RegNo, Committee, Category) - Black & White
const downloadPDF = (
  records: AttendanceRecord[],
  filename: string,
  dateKey: string,
  category: string,
  sessionName?: string,
) => {
  const doc = new jsPDF('p', 'mm', 'a4');

  // Header
  doc.setFontSize(16);
  doc.text('Attendance Report', 14, 15);

  doc.setFontSize(10);
  doc.text(`Date: ${dateKey}`, 14, 22);
  doc.text(`Category: ${category.toUpperCase()}`, 14, 28);
  if (sessionName) {
    doc.text(`Session: ${sessionName}`, 14, 34);
    doc.text(`Total Students: ${records.length}`, 14, 40);
  } else {
    doc.text(`Total Students: ${records.length}`, 14, 34);
  }

  // Table data with only 4 columns
  const tableData = records.map((r) => [
    r.studentName || '',
    r.regNo || '',
    r.committee || '',
    r.category?.toUpperCase() || '',
  ]);

  autoTable(doc, {
    head: [['Name', 'Registration Number', 'Committee', 'Category']],
    body: tableData,
    startY: sessionName ? 45 : 40,
    theme: 'grid',
    headStyles: {
      fillColor: [255, 255, 255], // White background
      textColor: [0, 0, 0], // Black text
      fontStyle: 'bold',
      lineWidth: 0.5,
      lineColor: [0, 0, 0], // Black border
    },
    styles: {
      fontSize: 9,
      cellPadding: 3,
      textColor: [0, 0, 0], // Black text
      lineWidth: 0.5,
      lineColor: [0, 0, 0], // Black border
    },
    columnStyles: {
      0: { cellWidth: 60 }, // Name
      1: { cellWidth: 45 }, // RegNo
      2: { cellWidth: 45 }, // Committee
      3: { cellWidth: 30 }, // Category
    },
    didDrawPage: (data) => {
      // Footer with page numbers
      const pageCount = doc.getNumberOfPages();
      const pageNumber = doc.getCurrentPageInfo().pageNumber;
      doc.setFontSize(8);
      doc.text(
        `Page ${pageNumber} of ${pageCount}`,
        doc.internal.pageSize.width / 2,
        doc.internal.pageSize.height - 10,
        { align: 'center' },
      );
    },
  });

  doc.save(filename);
};

export default function AdminAttendancePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [dateKey, setDateKey] = useState(formatDateKey(new Date()));
  const [category, setCategory] = useState<'all' | 'od' | 'scholarship' | 'lab'>('all');
  const [sessionConfig, setSessionConfig] = useState<SessionConfig | null>(null);
  const [selectedSessionIndex, setSelectedSessionIndex] = useState<number | null>(null);
  const [coordinatorUid, setCoordinatorUid] = useState('');
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');

  // Load session config when date changes
  useEffect(() => {
    const loadSessionConfig = async () => {
      if (!dateKey) return;
      const config = await getSessionConfig(dateKey);
      setSessionConfig(config);
      setSelectedSessionIndex(null);
    };

    loadSessionConfig();
  }, [dateKey]);

  if (loading || !user || !isAdmin(user.email)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500"></div>
      </div>
    );
  }

  const handleFetch = async () => {
    setError('');
    setFetching(true);
    try {
      const data = await getAttendanceAdmin({
        dateKey,
        category: category === 'all' ? undefined : category,
        coordinatorUid: coordinatorUid || undefined,
      });

      // Filter by session if selected
      let filteredData = data;
      if (selectedSessionIndex !== null) {
        const sessionId = `${dateKey}-session-${selectedSessionIndex}`;
        filteredData = data.filter((r) => r.sessionId === sessionId);
      }

      setAttendance(filteredData);
    } catch (e) {
      console.error(e);
      setError('Failed to load attendance.');
    } finally {
      setFetching(false);
    }
  };

  const handleDownloadCSV = () => {
    if (!attendance.length) return;
    const csv = buildCSV(attendance);
    const catLabel = category === 'all' ? 'all' : category;
    const sessionLabel =
      selectedSessionIndex !== null
        ? `-${sessionConfig?.sessionNames[selectedSessionIndex].replace(/\s+/g, '-')}`
        : '';
    downloadCSV(csv, `attendance-${dateKey}-${catLabel}${sessionLabel}.csv`);
  };

  const handleDownloadExcel = () => {
    if (!attendance.length) return;
    const catLabel = category === 'all' ? 'all' : category;
    const sessionLabel =
      selectedSessionIndex !== null
        ? `-${sessionConfig?.sessionNames[selectedSessionIndex].replace(/\s+/g, '-')}`
        : '';
    downloadExcel(attendance, `attendance-${dateKey}-${catLabel}${sessionLabel}.xlsx`);
  };

  const handleDownloadPDF = () => {
    if (!attendance.length) return;
    const catLabel = category === 'all' ? 'all' : category;
    const sessionLabel =
      selectedSessionIndex !== null
        ? `-${sessionConfig?.sessionNames[selectedSessionIndex].replace(/\s+/g, '-')}`
        : '';
    const sessionName =
      selectedSessionIndex !== null
        ? sessionConfig?.sessionNames[selectedSessionIndex]
        : undefined;
    downloadPDF(
      attendance,
      `attendance-${dateKey}-${catLabel}${sessionLabel}.pdf`,
      dateKey,
      catLabel,
      sessionName,
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-100 mb-2">
              Attendance Reports
            </h1>
            <p className="text-slate-400">
              Filter by date, session, category, and coordinator, then export
            </p>
          </div>
          <button
            onClick={() => router.push('/admin')}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg text-sm"
          >
            ← Back
          </button>
        </div>

        {/* Filters */}
        <div className="mb-6 bg-slate-900 border border-slate-700 rounded-xl p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium mb-2">Date</label>
              <input
                type="date"
                value={dateKey}
                onChange={(e) => setDateKey(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm"
              >
                <option value="all">All</option>
                <option value="od">OD</option>
                <option value="scholarship">Scholarship</option>
                <option value="lab">Lab</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Session (optional)
              </label>
              {sessionConfig ? (
                <select
                  value={selectedSessionIndex ?? ''}
                  onChange={(e) =>
                    setSelectedSessionIndex(
                      e.target.value === '' ? null : parseInt(e.target.value),
                    )
                  }
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm"
                >
                  <option value="">All Sessions</option>
                  {sessionConfig.sessionNames.map((name, idx) => (
                    <option key={idx} value={idx}>
                      {name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm text-slate-500">
                  No sessions configured
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Coordinator UID (optional)
              </label>
              <input
                type="text"
                value={coordinatorUid}
                onChange={(e) => setCoordinatorUid(e.target.value)}
                placeholder="Leave empty for all"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleFetch}
              disabled={fetching}
              className="px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-slate-900 font-semibold rounded-lg disabled:opacity-50 flex items-center gap-2"
            >
              {fetching ? (
                <>
                  <div className="animate-spin h-4 w-4 border-2 border-slate-900 border-t-transparent rounded-full"></div>
                  Loading...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  Load Attendance
                </>
              )}
            </button>

            <button
              onClick={handleDownloadCSV}
              disabled={!attendance.length}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg disabled:opacity-50 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              CSV
            </button>

            <button
              onClick={handleDownloadExcel}
              disabled={!attendance.length}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg disabled:opacity-50 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Excel
            </button>

            <button
              onClick={handleDownloadPDF}
              disabled={!attendance.length}
              className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg disabled:opacity-50 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              PDF
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-900/50 border border-red-500 rounded-lg text-sm text-red-200">
            {error}
          </div>
        )}

        {/* Results Table */}
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Results</h2>
            <span className="text-sm text-slate-400">
              {attendance.length} records
            </span>
          </div>

          {fetching ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
              <span className="ml-3 text-slate-400">Loading...</span>
            </div>
          ) : !attendance.length ? (
            <div className="text-center py-12 text-slate-500">
              <p className="text-lg mb-2">No records found</p>
              <p className="text-sm">
                Adjust filters and click &quot;Load Attendance&quot;.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="py-3 px-4 text-left text-slate-300">Name</th>
                    <th className="py-3 px-4 text-left text-slate-300">Reg No</th>
                    <th className="py-3 px-4 text-left text-slate-300">Department</th>
                    <th className="py-3 px-4 text-left text-slate-300">Session</th>
                    <th className="py-3 px-4 text-left text-slate-300">Committee</th>
                    <th className="py-3 px-4 text-left text-slate-300">Category</th>
                  </tr>
                </thead>
                <tbody>
                  {attendance.map((r) => (
                    <tr key={r.id} className="border-b border-slate-800 hover:bg-slate-850">
                      <td className="py-3 px-4">{r.studentName}</td>
                      <td className="py-3 px-4 font-mono text-amber-400">{r.regNo}</td>
                      <td className="py-3 px-4 text-slate-400">{r.department || '-'}</td>
                      <td className="py-3 px-4">
                        <span className="px-3 py-1 bg-slate-700 text-slate-300 text-xs rounded-md">
                          {r.sessionName || '-'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-400">{r.committee || '-'}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium ${
                            r.category === 'od'
                              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                              : r.category === 'scholarship'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                          }`}
                        >
                          {r.category?.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
