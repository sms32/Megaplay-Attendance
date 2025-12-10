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

export function CategoryToggle({
  value,
  onChange,
  disabled,
}: {
  value: 'od' | 'scholarship';
  onChange: (val: 'od' | 'scholarship') => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex rounded-2xl bg-black/40 border border-white/15 p-1 text-xs sm:text-sm">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange('od')}
        className={`px-3 sm:px-4 py-1.5 rounded-xl font-medium transition-all ${
          value === 'od'
            ? 'bg-white text-slate-900 shadow-[0_8px_24px_rgba(0,0,0,0.7)]'
            : 'text-slate-200 hover:text-white hover:bg-white/5'
        }`}
      >
        OD
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange('scholarship')}
        className={`px-3 sm:px-4 py-1.5 rounded-xl font-medium transition-all ${
          value === 'scholarship'
            ? 'bg-white text-slate-900 shadow-[0_8px_24px_rgba(0,0,0,0.7)]'
            : 'text-slate-200 hover:text-white hover:bg-white/5'
        }`}
      >
        Scholarship
      </button>
    </div>
  );
}


export default function StudentsUploadPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

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

  const [uploadMode, setUploadMode] = useState<'sequential' | 'parallel'>(
    'sequential',
  );

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
      <div className="flex items-center justify-center py-16 text-slate-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-9 w-9 border-2 border-sky-400 border-t-transparent mx-auto mb-3" />
          <p className="text-sm">Checking access…</p>
        </div>
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

      if (rows.length > 1000) {
        setUploadMode('sequential');
      } else {
        setUploadMode('parallel');
      }
    } catch (err) {
      setError(`Failed to parse CSV: ${err}`);
    }

    e.target.value = '';
  };

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
      const uploadFn =
        uploadMode === 'parallel'
          ? bulkUploadStudentsParallel
          : bulkUploadStudents;

      const result = await uploadFn(
        csvRows,
        columnMapping,
        categoryType,
        user!.uid,
        (progress) => {
          setUploadProgress(progress);
        },
      );

      if (result.success > 0) {
        setSuccess(
          `Uploaded ${result.success} students successfully.${result.failed > 0 ? ` ${result.failed} failed.` : ''} Resetting form…`,
        );

        if (result.errors.length > 0) {
          console.error('Upload errors:', result.errors);
        }

        setTimeout(() => {
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
      const studentData: Student = {
        ...manualForm,
        categories: {
          [categoryType]: true,
        },
      };

      await addOrUpdateStudent(studentData, user!.uid);

      setSuccess(
        `Student ${manualForm.regNo} added successfully. Redirecting…`,
      );

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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-slate-50">
            Add Students
          </h1>
          <p className="mt-1 text-sm text-slate-300">
            Upload a CSV file or manually enter student details.
          </p>
        </div>
        
      </div>

      {/* Messages */}
      {error && (
        <div className="rounded-2xl bg-red-500/10 border border-red-500/40 px-4 py-3 text-xs sm:text-sm text-red-100">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/40 px-4 py-3 text-xs sm:text-sm text-emerald-100">
          {success}
        </div>
      )}

      {/* Upload Progress */}
      {uploadProgress && (
        <div className="rounded-2xl bg-sky-500/10 border border-sky-500/40 px-4 py-3 text-xs sm:text-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sky-100">
              Uploading {uploadProgress.current} / {uploadProgress.total}
            </span>
            <span className="font-semibold text-sky-100">
              {uploadProgress.percent}%
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-slate-800">
            <div
              className="h-2 rounded-full bg-gradient-to-r from-teal-400 to-sky-500 transition-all duration-300"
              style={{ width: `${uploadProgress.percent}%` }}
            />
          </div>
        </div>
      )}

      {/* Mode Selection */}
      <div className="inline-flex rounded-2xl bg-black/40 border border-white/15 p-1 gap-1">
        <button
          onClick={() => {
            setMode('csv');
            setShowMapping(false);
            setError('');
            setSuccess('');
            setUploadProgress(null);
          }}
          disabled={uploading}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all ${
            mode === 'csv'
              ? 'bg-white text-slate-900 shadow-[0_10px_30px_rgba(0,0,0,0.7)]'
              : 'text-slate-200 hover:text-white hover:bg-white/5'
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
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all ${
            mode === 'manual'
              ? 'bg-white text-slate-900 shadow-[0_10px_30px_rgba(0,0,0,0.7)]'
              : 'text-slate-200 hover:text-white hover:bg-white/5'
          }`}
        >
          ✍️ Manual Entry
        </button>
      </div>

      {/* CSV Upload Mode */}
      {mode === 'csv' && !showMapping && (
        <div className="rounded-3xl bg-black/60 border border-white/10 backdrop-blur-2xl px-6 py-7 shadow-[0_18px_60px_rgba(0,0,0,0.9)]">
          <h2 className="text-lg sm:text-xl font-semibold text-slate-50 mb-5">
            CSV Upload
          </h2>

          {/* Category Type */}
          <div className="mb-6">
  <label className="block text-xs sm:text-sm font-medium mb-2 text-slate-100">
    Category Type *
  </label>
  <CategoryToggle
    value={categoryType}
    onChange={(val) => setCategoryType(val)}
    disabled={uploading}
  />
</div>


          {/* File Upload */}
          <div>
            <label className="block text-xs sm:text-sm font-medium mb-2 text-slate-100">
              Upload CSV File *
            </label>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              disabled={uploading}
              className="block w-full text-xs sm:text-sm file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-gradient-to-r file:from-teal-400 file:to-sky-500 file:text-slate-900 file:font-semibold hover:file:from-teal-300 hover:file:to-sky-400 cursor-pointer bg-black/30 border border-white/10 rounded-2xl px-2 py-2 text-slate-200"
            />
            <p className="mt-2 text-[11px] text-slate-400">
  CSV columns must be in this exact order:
  {' '}
  <span className="font-semibold text-slate-200">
    Register Number, Student Name, Committee, Hostel, Room, Phone, Department
  </span>
  . First row should contain the headers.
</p>
          </div>
        </div>
      )
    }

      {/* CSV Column Mapping */}
      {mode === 'csv' && showMapping && (
        <div className="rounded-3xl bg-black/60 border border-white/10 backdrop-blur-2xl px-6 py-7 shadow-[0_18px_60px_rgba(0,0,0,0.9)]">
          <h2 className="text-lg sm:text-xl font-semibold text-slate-50 mb-5">
            Map CSV Columns
          </h2>

          <div className="mb-5 rounded-2xl bg-sky-500/10 border border-sky-500/40 px-4 py-3 text-xs sm:text-sm text-sky-100">
            Detected {csvHeaders.length} columns and{' '}
            <span className="font-semibold">{csvRows.length} rows</span>. Choose
            which columns map to system fields.
          </div>

          {/* Upload Mode Selection */}
          <div className="mb-6">
            <label className="block text-xs sm:text-sm font-medium mb-2 text-slate-100">
              Upload speed mode
            </label>
            <div className="flex flex-wrap gap-4 text-xs sm:text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  value="parallel"
                  checked={uploadMode === 'parallel'}
                  onChange={(e) =>
                    setUploadMode(e.target.value as 'parallel' | 'sequential')
                  }
                  className="w-4 h-4"
                  disabled={uploading}
                />
                <span>
                  ⚡ Fast (Parallel)
                  {csvRows.length <= 1000 && (
                    <span className="ml-1 text-[11px] text-emerald-300">
                      • Recommended
                    </span>
                  )}
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  value="sequential"
                  checked={uploadMode === 'sequential'}
                  onChange={(e) =>
                    setUploadMode(e.target.value as 'parallel' | 'sequential')
                  }
                  className="w-4 h-4"
                  disabled={uploading}
                />
                <span>
                  🐢 Stable (Sequential)
                  {csvRows.length > 1000 && (
                    <span className="ml-1 text-[11px] text-emerald-300">
                      • Recommended
                    </span>
                  )}
                </span>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6 text-xs sm:text-sm">
            {/* RegNo */}
            <div>
              <label className="block font-medium mb-1.5 text-slate-100">
                Registration Number *
              </label>
              <select
                value={columnMapping.regNo}
                onChange={(e) =>
                  setColumnMapping({ ...columnMapping, regNo: e.target.value })
                }
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-300"
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
              <label className="block font-medium mb-1.5 text-slate-100">
                Name *
              </label>
              <select
                value={columnMapping.name}
                onChange={(e) =>
                  setColumnMapping({ ...columnMapping, name: e.target.value })
                }
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-300"
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
              <label className="block font-medium mb-1.5 text-slate-100">
                Committee (optional)
              </label>
              <select
                value={columnMapping.committee || ''}
                onChange={(e) =>
                  setColumnMapping({
                    ...columnMapping,
                    committee: e.target.value || undefined,
                  })
                }
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-300"
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
              <label className="block font-medium mb-1.5 text-slate-100">
                Hostel (optional)
              </label>
              <select
                value={columnMapping.hostel || ''}
                onChange={(e) =>
                  setColumnMapping({
                    ...columnMapping,
                    hostel: e.target.value || undefined,
                  })
                }
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-300"
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

            {/* Room */}
            <div>
              <label className="block font-medium mb-1.5 text-slate-100">
                Room Number (optional)
              </label>
              <select
                value={columnMapping.roomNumber || ''}
                onChange={(e) =>
                  setColumnMapping({
                    ...columnMapping,
                    roomNumber: e.target.value || undefined,
                  })
                }
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-300"
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

            {/* Phone */}
            <div>
              <label className="block font-medium mb-1.5 text-slate-100">
                Phone Number (optional)
              </label>
              <select
                value={columnMapping.phoneNumber || ''}
                onChange={(e) =>
                  setColumnMapping({
                    ...columnMapping,
                    phoneNumber: e.target.value || undefined,
                  })
                }
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-300"
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
              <label className="block font-medium mb-1.5 text-slate-100">
                Department (optional)
              </label>
              <select
                value={columnMapping.department || ''}
                onChange={(e) =>
                  setColumnMapping({
                    ...columnMapping,
                    department: e.target.value || undefined,
                  })
                }
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-300"
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
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleCSVUpload}
              disabled={uploading || !columnMapping.regNo || !columnMapping.name}
              className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-teal-400 to-sky-500 text-slate-900 text-sm font-semibold shadow-[0_14px_40px_rgba(45,212,191,0.5)] hover:from-teal-300 hover:to-sky-400 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
            >
              {uploading ? (
                <>
                  <span className="animate-spin rounded-full h-4 w-4 border-2 border-slate-900 border-t-transparent" />
                  Uploading…
                </>
              ) : (
                <>Upload {csvRows.length} students as {categoryType.toUpperCase()}</>
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
              className="px-5 py-3 rounded-xl bg-black/40 border border-white/15 text-sm text-slate-100 hover:bg-white/5 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Manual Entry */}
      {mode === 'manual' && (
        <div className="rounded-3xl bg-black/60 border border-white/10 backdrop-blur-2xl px-6 py-7 shadow-[0_18px_60px_rgba(0,0,0,0.9)]">
          <h2 className="text-lg sm:text-xl font-semibold text-slate-50 mb-5">
            Manual Student Entry
          </h2>

          {/* Category Type */}
          <div className="mb-6">
  <label className="block text-xs sm:text-sm font-medium mb-2 text-slate-100">
    Category Type *
  </label>
  <CategoryToggle
    value={categoryType}
    onChange={(val) => setCategoryType(val)}
    disabled={uploading}
  />
</div>


          <form
            onSubmit={handleManualSubmit}
            className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs sm:text-sm"
          >
            {/* RegNo */}
            <div>
              <label className="block font-medium mb-1.5 text-slate-100">
                Registration Number *
              </label>
              <input
                type="text"
                value={manualForm.regNo}
                onChange={(e) =>
                  setManualForm({ ...manualForm, regNo: e.target.value })
                }
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-300"
                placeholder="21BECE1001"
                required
                disabled={uploading}
              />
            </div>

            {/* Name */}
            <div>
              <label className="block font-medium mb-1.5 text-slate-100">
                Name *
              </label>
              <input
                type="text"
                value={manualForm.name}
                onChange={(e) =>
                  setManualForm({ ...manualForm, name: e.target.value })
                }
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-300"
                placeholder="John Doe"
                required
                disabled={uploading}
              />
            </div>

            {/* Committee */}
            <div>
              <label className="block font-medium mb-1.5 text-slate-100">
                Committee
              </label>
              <input
                type="text"
                value={manualForm.committee}
                onChange={(e) =>
                  setManualForm({ ...manualForm, committee: e.target.value })
                }
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-300"
                placeholder="Dance / Singing / etc."
                disabled={uploading}
              />
            </div>

            {/* Hostel */}
            <div>
              <label className="block font-medium mb-1.5 text-slate-100">
                Hostel
              </label>
              <input
                type="text"
                value={manualForm.hostel}
                onChange={(e) =>
                  setManualForm({ ...manualForm, hostel: e.target.value })
                }
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-300"
                placeholder="Hostel A"
                disabled={uploading}
              />
            </div>

            {/* Room */}
            <div>
              <label className="block font-medium mb-1.5 text-slate-100">
                Room Number
              </label>
              <input
                type="text"
                value={manualForm.roomNumber}
                onChange={(e) =>
                  setManualForm({
                    ...manualForm,
                    roomNumber: e.target.value,
                  })
                }
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-300"
                placeholder="101"
                disabled={uploading}
              />
            </div>

            {/* Phone */}
            <div>
              <label className="block font-medium mb-1.5 text-slate-100">
                Phone Number
              </label>
              <input
                type="tel"
                value={manualForm.phoneNumber}
                onChange={(e) =>
                  setManualForm({
                    ...manualForm,
                    phoneNumber: e.target.value,
                  })
                }
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-300"
                placeholder="+91 9876543210"
                disabled={uploading}
              />
            </div>

            {/* Department */}
            <div>
              <label className="block font-medium mb-1.5 text-slate-100">
                Department
              </label>
              <input
                type="text"
                value={manualForm.department}
                onChange={(e) =>
                  setManualForm({
                    ...manualForm,
                    department: e.target.value,
                  })
                }
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-300"
                placeholder="ECE / CSE / etc."
                disabled={uploading}
              />
            </div>

            {/* Submit */}
            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={uploading || !manualForm.regNo || !manualForm.name}
                className="w-full px-5 py-3 rounded-xl bg-gradient-to-r from-teal-400 to-sky-500 text-slate-900 text-sm font-semibold shadow-[0_14px_40px_rgba(45,212,191,0.5)] hover:from-teal-300 hover:to-sky-400 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
              >
                {uploading
                  ? 'Adding student…'
                  : `Add student as ${categoryType.toUpperCase()}`}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
