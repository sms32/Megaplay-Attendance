// app/admin/students/upload/page.tsx
'use client';

import { useState } from 'react';
import { useAuth } from '@/app/context/AuthContext';
import { useRouter } from 'next/navigation';
import { isAdmin } from '@/lib/utils/adminCheck';
import {
  parseCSV,
  bulkUploadStudents,
  bulkUploadStudentsParallel,
  addOrUpdateStudent,
  ColumnMapping,
  Student,
} from '@/lib/services/studentService';

export default function StudentsUploadPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Mode selection
  const [mode, setMode] = useState<'csv' | 'manual'>('csv');

  // CSV Upload State
  const [categoryType, setCategoryType] = useState<'od' | 'scholarship'>('od');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<any[]>([]);
  const [showMapping, setShowMapping] = useState(false);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({
    regNo: '',
    name: '',
  });

  // Upload mode (sequential vs parallel)
  const [uploadMode, setUploadMode] = useState<'sequential' | 'parallel'>('sequential');

  // Progress tracking
  const [uploadProgress, setUploadProgress] = useState<{
    current: number;
    total: number;
    percent: number;
  } | null>(null);

  // Manual Entry State
  const [manualForm, setManualForm] = useState<Student>({
    regNo: '',
    name: '',
    committee: '',
    hostel: '',
    roomNumber: '',
    phoneNumber: '',
    department: '',
    categories: {},
  });

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  if (loading || !user || !isAdmin(user.email)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500"></div>
      </div>
    );
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');
    setSuccess('');
    setUploadProgress(null);

    try {
      const text = await file.text();
      const { headers, rows } = parseCSV(text);

      setCsvHeaders(headers);
      setCsvRows(rows);
      setShowMapping(true);

      // Auto-detect common column names
      const autoMapping: ColumnMapping = {
        regNo: headers.find((h) => /regno|reg\s*no|register/i.test(h)) || '',
        name: headers.find((h) => /name|student/i.test(h)) || '',
        committee: headers.find((h) => /committee/i.test(h)),
        hostel: headers.find((h) => /hostel/i.test(h)),
        roomNumber: headers.find((h) => /room/i.test(h)),
        phoneNumber: headers.find((h) => /phone|mobile|contact/i.test(h)),
        department: headers.find((h) => /dept|department/i.test(h)),
      };

      setColumnMapping(autoMapping);

      // Auto-select upload mode based on dataset size
      if (rows.length > 1000) {
        setUploadMode('sequential');
      } else {
        setUploadMode('parallel');
      }
    } catch (err) {
      setError(`Failed to parse CSV: ${err}`);
    }

    e.target.value = ''; // Reset input
  };

  // app/admin/students/upload/page.tsx - UPDATE handleCSVUpload function

const handleCSVUpload = async () => {
  setError('');
  setSuccess('');
  setUploadProgress(null);

  if (!columnMapping.regNo || !columnMapping.name) {
    setError('Please map at least Registration Number and Name columns.');
    return;
  }

  setUploading(true);

  try {
    const uploadFn = uploadMode === 'parallel' 
      ? bulkUploadStudentsParallel 
      : bulkUploadStudents;

    const result = await uploadFn(
      csvRows,
      columnMapping,
      categoryType,
      user!.uid,
      (progress) => {
        setUploadProgress(progress);
      }
    );

    if (result.success > 0) {
      setSuccess(
        `✅ Uploaded ${result.success} students successfully! ${
          result.failed > 0 ? `⚠️ ${result.failed} failed.` : ''
        } Resetting form...`
      );

      if (result.errors.length > 0) {
        console.error('Upload errors:', result.errors);
      }

      // ✅ Reset form after 2 seconds to show upload option again
      setTimeout(() => {
        // Reset all state
        setShowMapping(false);
        setCsvHeaders([]);
        setCsvRows([]);
        setColumnMapping({ regNo: '', name: '' });
        setUploadProgress(null);
        setSuccess('');
        setUploading(false);
      }, 2000);
    } else {
      setError('Upload failed. Please check the console for errors.');
      console.error('Upload errors:', result.errors);
      setUploading(false);
      setUploadProgress(null);
    }
  } catch (err) {
    setError(`Upload failed: ${err}`);
    setUploading(false);
    setUploadProgress(null);
  }
};


  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!manualForm.regNo || !manualForm.name) {
      setError('Registration Number and Name are required.');
      return;
    }

    setUploading(true);

    try {
      // Set category based on selection
      const studentData: Student = {
        ...manualForm,
        categories: {
          [categoryType]: true,
        },
      };

      await addOrUpdateStudent(studentData, user!.uid);

      setSuccess(`✅ Student ${manualForm.regNo} added successfully! Redirecting...`);

      // Redirect after success
      setTimeout(() => {
        router.push('/admin/students');
        router.refresh();
      }, 1500);
    } catch (err) {
      setError(`Failed to add student: ${err}`);
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-100 mb-2">Add Students</h1>
            <p className="text-slate-400">Upload CSV or manually enter student details</p>
          </div>
          <button
            onClick={() => router.push('/admin/students')}
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

        {/* Upload Progress Bar */}
        {uploadProgress && (
          <div className="mb-4 p-4 bg-blue-900/50 border border-blue-500 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-blue-300 text-sm font-medium">
                Uploading... {uploadProgress.current} / {uploadProgress.total}
              </span>
              <span className="text-blue-300 text-sm font-semibold">
                {uploadProgress.percent}%
              </span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-2.5">
              <div
                className="bg-blue-500 h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress.percent}%` }}
              ></div>
            </div>
          </div>
        )}

        {/* Mode Selection */}
        <div className="mb-6 flex gap-4">
          <button
            onClick={() => {
              setMode('csv');
              setShowMapping(false);
              setError('');
              setSuccess('');
              setUploadProgress(null);
            }}
            disabled={uploading}
            className={`px-6 py-3 rounded-lg font-semibold transition-all disabled:opacity-50 ${
              mode === 'csv'
                ? 'bg-amber-600 text-slate-900'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            📂 CSV Upload
          </button>
          <button
            onClick={() => {
              setMode('manual');
              setShowMapping(false);
              setError('');
              setSuccess('');
              setUploadProgress(null);
            }}
            disabled={uploading}
            className={`px-6 py-3 rounded-lg font-semibold transition-all disabled:opacity-50 ${
              mode === 'manual'
                ? 'bg-amber-600 text-slate-900'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            ✍️ Manual Entry
          </button>
        </div>

        {/* CSV Upload Mode */}
        {mode === 'csv' && !showMapping && (
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-8">
            <h2 className="text-xl font-semibold mb-6">CSV Upload</h2>

            {/* Category Type */}
            <div className="mb-6">
              <label className="block text-sm font-medium mb-3">Category Type *</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value="od"
                    checked={categoryType === 'od'}
                    onChange={(e) => setCategoryType(e.target.value as 'od')}
                    className="w-4 h-4"
                  />
                  <span>OD (On Duty)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value="scholarship"
                    checked={categoryType === 'scholarship'}
                    onChange={(e) => setCategoryType(e.target.value as 'scholarship')}
                    className="w-4 h-4"
                  />
                  <span>Scholarship</span>
                </label>
              </div>
            </div>

            {/* File Upload */}
            <div>
              <label className="block text-sm font-medium mb-3">Upload CSV File *</label>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-amber-600 file:text-slate-900 file:font-semibold hover:file:bg-amber-700 cursor-pointer"
              />
              <p className="mt-2 text-xs text-slate-500">
                CSV format: first row as headers, one student per row
              </p>
            </div>
          </div>
        )}

        {/* CSV Column Mapping */}
        {mode === 'csv' && showMapping && (
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-8">
            <h2 className="text-xl font-semibold mb-6">Map CSV Columns to System Fields</h2>

            <div className="mb-6 p-4 bg-blue-900/30 border border-blue-500/50 rounded-lg">
              <p className="text-sm text-blue-200">
                ✅ Detected {csvHeaders.length} columns and{' '}
                <span className="font-semibold text-blue-100">{csvRows.length} students</span>.
                Map your CSV columns below.
              </p>
            </div>

            {/* Upload Mode Selection */}
            <div className="mb-6">
              <label className="block text-sm font-medium mb-3">Upload Speed Mode</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value="parallel"
                    checked={uploadMode === 'parallel'}
                    onChange={(e) => setUploadMode(e.target.value as 'parallel')}
                    className="w-4 h-4"
                    disabled={uploading}
                  />
                  <span>
                    ⚡ Fast (Parallel){' '}
                    {csvRows.length <= 1000 && (
                      <span className="text-xs text-green-400">• Recommended</span>
                    )}
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value="sequential"
                    checked={uploadMode === 'sequential'}
                    onChange={(e) => setUploadMode(e.target.value as 'sequential')}
                    className="w-4 h-4"
                    disabled={uploading}
                  />
                  <span>
                    🐢 Stable (Sequential){' '}
                    {csvRows.length > 1000 && (
                      <span className="text-xs text-green-400">• Recommended</span>
                    )}
                  </span>
                </label>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {uploadMode === 'parallel'
                  ? '⚡ Faster upload (3-5x) - Best for <1000 students'
                  : '🐢 Slower but more stable - Best for large datasets (1000+ students)'}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              {/* RegNo */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Registration Number * <span className="text-amber-400">(Required)</span>
                </label>
                <select
                  value={columnMapping.regNo}
                  onChange={(e) => setColumnMapping({ ...columnMapping, regNo: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm"
                  disabled={uploading}
                >
                  <option value="">-- Select Column --</option>
                  {csvHeaders.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              {/* Name */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Name * <span className="text-amber-400">(Required)</span>
                </label>
                <select
                  value={columnMapping.name}
                  onChange={(e) => setColumnMapping({ ...columnMapping, name: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm"
                  disabled={uploading}
                >
                  <option value="">-- Select Column --</option>
                  {csvHeaders.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              {/* Committee */}
              <div>
                <label className="block text-sm font-medium mb-2">Committee (Optional)</label>
                <select
                  value={columnMapping.committee || ''}
                  onChange={(e) =>
                    setColumnMapping({ ...columnMapping, committee: e.target.value || undefined })
                  }
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm"
                  disabled={uploading}
                >
                  <option value="">-- Not Included --</option>
                  {csvHeaders.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              {/* Hostel */}
              <div>
                <label className="block text-sm font-medium mb-2">Hostel (Optional)</label>
                <select
                  value={columnMapping.hostel || ''}
                  onChange={(e) =>
                    setColumnMapping({ ...columnMapping, hostel: e.target.value || undefined })
                  }
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm"
                  disabled={uploading}
                >
                  <option value="">-- Not Included --</option>
                  {csvHeaders.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              {/* Room Number */}
              <div>
                <label className="block text-sm font-medium mb-2">Room Number (Optional)</label>
                <select
                  value={columnMapping.roomNumber || ''}
                  onChange={(e) =>
                    setColumnMapping({ ...columnMapping, roomNumber: e.target.value || undefined })
                  }
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm"
                  disabled={uploading}
                >
                  <option value="">-- Not Included --</option>
                  {csvHeaders.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              {/* Phone Number */}
              <div>
                <label className="block text-sm font-medium mb-2">Phone Number (Optional)</label>
                <select
                  value={columnMapping.phoneNumber || ''}
                  onChange={(e) =>
                    setColumnMapping({ ...columnMapping, phoneNumber: e.target.value || undefined })
                  }
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm"
                  disabled={uploading}
                >
                  <option value="">-- Not Included --</option>
                  {csvHeaders.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              {/* Department */}
              <div>
                <label className="block text-sm font-medium mb-2">Department (Optional)</label>
                <select
                  value={columnMapping.department || ''}
                  onChange={(e) =>
                    setColumnMapping({ ...columnMapping, department: e.target.value || undefined })
                  }
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm"
                  disabled={uploading}
                >
                  <option value="">-- Not Included --</option>
                  {csvHeaders.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-4">
              <button
                onClick={handleCSVUpload}
                disabled={uploading || !columnMapping.regNo || !columnMapping.name}
                className="flex-1 px-6 py-3 bg-amber-600 hover:bg-amber-700 text-slate-900 font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {uploading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-slate-900 border-t-transparent"></div>
                    Uploading...
                  </>
                ) : (
                  <>
                    🚀 Upload {csvRows.length} Students as {categoryType.toUpperCase()}
                  </>
                )}
              </button>
              <button
                onClick={() => {
                  setShowMapping(false);
                  setCsvHeaders([]);
                  setCsvRows([]);
                  setUploadProgress(null);
                }}
                disabled={uploading}
                className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Manual Entry Mode */}
        {mode === 'manual' && (
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-8">
            <h2 className="text-xl font-semibold mb-6">Manual Student Entry</h2>

            {/* Category Type */}
            <div className="mb-6">
              <label className="block text-sm font-medium mb-3">Category Type *</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value="od"
                    checked={categoryType === 'od'}
                    onChange={(e) => setCategoryType(e.target.value as 'od')}
                    className="w-4 h-4"
                    disabled={uploading}
                  />
                  <span>OD (On Duty)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value="scholarship"
                    checked={categoryType === 'scholarship'}
                    onChange={(e) => setCategoryType(e.target.value as 'scholarship')}
                    className="w-4 h-4"
                    disabled={uploading}
                  />
                  <span>Scholarship</span>
                </label>
              </div>
            </div>

            <form onSubmit={handleManualSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* RegNo */}
              <div>
                <label className="block text-sm font-medium mb-2">Registration Number *</label>
                <input
                  type="text"
                  value={manualForm.regNo}
                  onChange={(e) => setManualForm({ ...manualForm, regNo: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="21BECE1001"
                  required
                  disabled={uploading}
                />
              </div>

              {/* Name */}
              <div>
                <label className="block text-sm font-medium mb-2">Name *</label>
                <input
                  type="text"
                  value={manualForm.name}
                  onChange={(e) => setManualForm({ ...manualForm, name: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="John Doe"
                  required
                  disabled={uploading}
                />
              </div>

              {/* Committee */}
              <div>
                <label className="block text-sm font-medium mb-2">Committee</label>
                <input
                  type="text"
                  value={manualForm.committee}
                  onChange={(e) => setManualForm({ ...manualForm, committee: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="Dance / Singing / etc."
                  disabled={uploading}
                />
              </div>

              {/* Hostel */}
              <div>
                <label className="block text-sm font-medium mb-2">Hostel</label>
                <input
                  type="text"
                  value={manualForm.hostel}
                  onChange={(e) => setManualForm({ ...manualForm, hostel: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="Hostel A"
                  disabled={uploading}
                />
              </div>

              {/* Room Number */}
              <div>
                <label className="block text-sm font-medium mb-2">Room Number</label>
                <input
                  type="text"
                  value={manualForm.roomNumber}
                  onChange={(e) => setManualForm({ ...manualForm, roomNumber: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="101"
                  disabled={uploading}
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-medium mb-2">Phone Number</label>
                <input
                  type="tel"
                  value={manualForm.phoneNumber}
                  onChange={(e) => setManualForm({ ...manualForm, phoneNumber: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="+91 9876543210"
                  disabled={uploading}
                />
              </div>

              {/* Department */}
              <div>
                <label className="block text-sm font-medium mb-2">Department</label>
                <input
                  type="text"
                  value={manualForm.department}
                  onChange={(e) => setManualForm({ ...manualForm, department: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="ECE / CSE / etc."
                  disabled={uploading}
                />
              </div>

              {/* Submit Button */}
              <div className="md:col-span-2">
                <button
                  type="submit"
                  disabled={uploading || !manualForm.regNo || !manualForm.name}
                  className="w-full px-6 py-3 bg-amber-600 hover:bg-amber-700 text-slate-900 font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploading ? 'Adding Student...' : `Add Student as ${categoryType.toUpperCase()}`}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
