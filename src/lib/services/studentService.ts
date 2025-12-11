// lib/services/studentService.ts
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  where,
  writeBatch,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase/config';

export interface Student {
  regNo: string; // Primary key (e.g., "21BECE1001")
  name: string;
  committee?: string; // Dance, Singing, etc.
  hostel?: string;
  roomNumber?: string;
  phoneNumber?: string;
  department?: string;

  // Category flags
  categories: {
    od?: boolean;
    scholarship?: boolean;
  };

  createdAt?: any;
  updatedAt?: any;
  createdBy?: string;
}

export interface ColumnMapping {
  regNo: string; // CSV column name for regNo (required)
  name: string; // CSV column name for name (required)
  committee?: string;
  hostel?: string;
  roomNumber?: string;
  phoneNumber?: string;
  department?: string;
}

export interface AttendanceRecord {
  date: string; // Format: "YYYY-MM-DD"
  status: 'present' | 'absent' | 'od' | 'leave';
  markedBy?: string; // Admin UID who marked
  markedAt?: any; // Timestamp
  remarks?: string;
}

export interface StudentAttendance {
  regNo: string;
  records: AttendanceRecord[];
  totalPresent?: number;
  totalAbsent?: number;
  totalOD?: number;
  totalLeave?: number;
  attendancePercentage?: number;
}

const STUDENTS_COLLECTION = 'students';
const BATCH_SIZE = 500; // Firestore batch write limit

/**
 * Get all students
 */
export const getAllStudents = async (): Promise<Student[]> => {
  try {
    const ref = collection(db, STUDENTS_COLLECTION);
    const q = query(ref, orderBy('regNo'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ ...d.data() } as Student));
  } catch (error: any) {
    console.error('getAllStudents error:', error.message);
    return [];
  }
};

/**
 * Get student by registration number
 */
export const getStudentByRegNo = async (regNo: string): Promise<Student | null> => {
  try {
    const regNoUpper = regNo.toUpperCase().trim();
    const ref = doc(db, STUDENTS_COLLECTION, regNoUpper);
    const snap = await getDoc(ref);

    if (snap.exists()) {
      return snap.data() as Student;
    }
    return null;
  } catch (error) {
    console.error('getStudentByRegNo error:', error);
    return null;
  }
};

/**
 * Search students
 */
export const searchStudents = async (searchTerm: string): Promise<Student[]> => {
  try {
    const allStudents = await getAllStudents();
    const term = searchTerm.toLowerCase().trim();

    return allStudents.filter(
      (s) =>
        s.regNo.toLowerCase().includes(term) ||
        s.name.toLowerCase().includes(term) ||
        (s.committee && s.committee.toLowerCase().includes(term)) ||
        (s.department && s.department.toLowerCase().includes(term)),
    );
  } catch (error) {
    console.error('searchStudents error:', error);
    return [];
  }
};

/**
 * Get students by category
 */
export const getStudentsByCategory = async (
  category: 'od' | 'scholarship',
): Promise<Student[]> => {
  try {
    const allStudents = await getAllStudents();
    return allStudents.filter((s) => s.categories?.[category] === true);
  } catch (error) {
    console.error('getStudentsByCategory error:', error);
    return [];
  }
};

/**
 * Add or update a single student
 */
export const addOrUpdateStudent = async (
  student: Student,
  createdByUid: string,
): Promise<void> => {
  const regNoUpper = student.regNo.toUpperCase().trim();
  const ref = doc(db, STUDENTS_COLLECTION, regNoUpper);

  const now = new Date();

  await setDoc(
    ref,
    {
      ...student,
      regNo: regNoUpper,
      updatedAt: now,
      createdBy: createdByUid,
    },
    { merge: true },
  );
};

/**
 * Delete a student
 */
export const deleteStudent = async (regNo: string): Promise<void> => {
  const regNoUpper = regNo.toUpperCase().trim();
  const ref = doc(db, STUDENTS_COLLECTION, regNoUpper);
  await deleteDoc(ref);
};

/**
 * ⚡ OPTIMIZED: Chunked helper to split array into batches of 500
 */
const chunkArray = <T>(array: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

/**
 * ⚡ OPTIMIZED: Process a single batch (max 500 writes)
 */
const processBatch = async (
  rows: any[],
  columnMapping: ColumnMapping,
  categoryType: 'od' | 'scholarship',
  createdByUid: string,
  now: Date,
): Promise<{ success: number; errors: string[] }> => {
  const batch = writeBatch(db);
  const errors: string[] = [];
  let success = 0;

  rows.forEach((row, index) => {
    try {
      // Required fields
      const regNo = row.regNo?.toString().trim();
      const name = row.name?.toString().trim();

      if (!regNo || !name) {
        errors.push(`Row ${row._originalIndex}: Missing regNo or name`);
        return;
      }

      const regNoUpper = regNo.toUpperCase();

      // Build student data with only mapped fields
      const studentData: any = {
        regNo: regNoUpper,
        name,
        categories: {
          [categoryType]: true,
        },
        updatedAt: now,
        createdBy: createdByUid,
      };

      // Optional fields - only add if mapped and value exists
      if (columnMapping.committee && row.committee) {
        studentData.committee = row.committee.toString().trim();
      }
      if (columnMapping.hostel && row.hostel) {
        studentData.hostel = row.hostel.toString().trim();
      }
      if (columnMapping.roomNumber && row.roomNumber) {
        studentData.roomNumber = row.roomNumber.toString().trim();
      }
      if (columnMapping.phoneNumber && row.phoneNumber) {
        studentData.phoneNumber = row.phoneNumber.toString().trim();
      }
      if (columnMapping.department && row.department) {
        studentData.department = row.department.toString().trim();
      }

      const ref = doc(db, STUDENTS_COLLECTION, regNoUpper);
      batch.set(ref, studentData, { merge: true });

      success++;
    } catch (err) {
      errors.push(`Row ${row._originalIndex}: ${err}`);
    }
  });

  try {
    await batch.commit();
  } catch (err) {
    errors.push(`Batch commit failed: ${err}`);
    return { success: 0, errors };
  }

  return { success, errors };
};

/**
 * ⚡ OPTIMIZED: Bulk upload with chunked batches and parallel processing
 * - Splits 400+ students into chunks of 500
 * - Processes chunks in parallel (configurable)
 * - Reduces write quota usage with merge: true
 * - Progress callback for UI updates
 */
export const bulkUploadStudents = async (
  csvRows: any[],
  columnMapping: ColumnMapping,
  categoryType: 'od' | 'scholarship',
  createdByUid: string,
  onProgress?: (progress: { current: number; total: number; percent: number }) => void,
): Promise<{ success: number; failed: number; errors: string[] }> => {
  const now = new Date();
  const allErrors: string[] = [];
  let totalSuccess = 0;

  // Map CSV rows to normalized data with original index
  const normalizedRows = csvRows.map((row, index) => {
    const normalized: any = { _originalIndex: index + 2 }; // +2 for header row and 1-based index

    // Map columns
    normalized.regNo = row[columnMapping.regNo];
    normalized.name = row[columnMapping.name];

    if (columnMapping.committee) {
      normalized.committee = row[columnMapping.committee];
    }
    if (columnMapping.hostel) {
      normalized.hostel = row[columnMapping.hostel];
    }
    if (columnMapping.roomNumber) {
      normalized.roomNumber = row[columnMapping.roomNumber];
    }
    if (columnMapping.phoneNumber) {
      normalized.phoneNumber = row[columnMapping.phoneNumber];
    }
    if (columnMapping.department) {
      normalized.department = row[columnMapping.department];
    }

    return normalized;
  });

  // Split into chunks of 500 (Firestore batch limit)
  const chunks = chunkArray(normalizedRows, BATCH_SIZE);

  console.log(`📦 Processing ${csvRows.length} students in ${chunks.length} batches`);

  // Process chunks sequentially to avoid overwhelming Firestore
  // For parallel processing (faster but more quota), use Promise.all
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    try {
      const result = await processBatch(chunk, columnMapping, categoryType, createdByUid, now);

      totalSuccess += result.success;
      allErrors.push(...result.errors);

      // Progress callback
      if (onProgress) {
        const processed = (i + 1) * BATCH_SIZE;
        onProgress({
          current: Math.min(processed, csvRows.length),
          total: csvRows.length,
          percent: Math.round((Math.min(processed, csvRows.length) / csvRows.length) * 100),
        });
      }

      console.log(
        `✅ Batch ${i + 1}/${chunks.length} complete: ${result.success} students uploaded`,
      );
    } catch (err) {
      console.error(`❌ Batch ${i + 1} failed:`, err);
      allErrors.push(`Batch ${i + 1} failed: ${err}`);
    }
  }

  return {
    success: totalSuccess,
    failed: allErrors.length,
    errors: allErrors,
  };
};

/**
 * ⚡ OPTIMIZED: Parallel bulk upload (faster but uses more quota)
 * Use this for smaller datasets (<2000 students) or when speed is critical
 */
export const bulkUploadStudentsParallel = async (
  csvRows: any[],
  columnMapping: ColumnMapping,
  categoryType: 'od' | 'scholarship',
  createdByUid: string,
  onProgress?: (progress: { current: number; total: number; percent: number }) => void,
): Promise<{ success: number; failed: number; errors: string[] }> => {
  const now = new Date();
  const allErrors: string[] = [];

  // Map CSV rows to normalized data with original index
  const normalizedRows = csvRows.map((row, index) => {
    const normalized: any = { _originalIndex: index + 2 };

    normalized.regNo = row[columnMapping.regNo];
    normalized.name = row[columnMapping.name];

    if (columnMapping.committee) normalized.committee = row[columnMapping.committee];
    if (columnMapping.hostel) normalized.hostel = row[columnMapping.hostel];
    if (columnMapping.roomNumber) normalized.roomNumber = row[columnMapping.roomNumber];
    if (columnMapping.phoneNumber) normalized.phoneNumber = row[columnMapping.phoneNumber];
    if (columnMapping.department) normalized.department = row[columnMapping.department];

    return normalized;
  });

  // Split into chunks of 500
  const chunks = chunkArray(normalizedRows, BATCH_SIZE);

  console.log(`🚀 Processing ${csvRows.length} students in ${chunks.length} parallel batches`);

  // Process all chunks in parallel (faster but more concurrent writes)
  const results = await Promise.all(
    chunks.map((chunk, i) => processBatch(chunk, columnMapping, categoryType, createdByUid, now)),
  );

  // Aggregate results
  const totalSuccess = results.reduce((sum, r) => sum + r.success, 0);
  results.forEach((r) => allErrors.push(...r.errors));

  // Final progress
  if (onProgress) {
    onProgress({
      current: csvRows.length,
      total: csvRows.length,
      percent: 100,
    });
  }

  return {
    success: totalSuccess,
    failed: allErrors.length,
    errors: allErrors,
  };
};

/**
 * Parse CSV helper (client-side)
 */
export const parseCSV = (csvText: string): { headers: string[]; rows: any[] } => {
  const lines = csvText.split('\n').filter((l) => l.trim());

  if (lines.length < 2) {
    throw new Error('CSV file is empty or has no data rows');
  }

  const headers = lines[0].split(',').map((h) => h.trim());
  const rows: any[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim());
    const row: any = {};

    headers.forEach((header, idx) => {
      row[header] = cols[idx] || '';
    });

    rows.push(row);
  }

  return { headers, rows };
};

/**
 * Bulk fetch students by regNos (parallel optimized)
 */
export const bulkFetchStudentsByRegNos = async (regNos: string[]): Promise<{
  found: Student[];
  notFound: string[];
}> => {
  try {
    const upperRegNos = regNos.map(r => r.toUpperCase().trim()).filter(Boolean);
    const fetchPromises = upperRegNos.map(regNo => getStudentByRegNo(regNo));
    const results = await Promise.all(fetchPromises);
    
    const found = results.filter(Boolean) as Student[];
    const notFound = upperRegNos.filter((_, i) => !results[i]);
    
    return { found, notFound };
  } catch (error: any) {
    console.error('bulkFetchStudentsByRegNos error:', error.message);
    return { found: [], notFound: regNos };
  }
};

/**
 * Bulk delete students (chunked batches like your upload)
 */
const processDeleteBatch = async (regNos: string[]): Promise<{ success: number; errors: string[] }> => {
  const batch = writeBatch(db);
  const errors: string[] = [];
  let success = 0;

  regNos.forEach(regNo => {
    try {
      const regNoUpper = regNo.toUpperCase().trim();
      const ref = doc(db, STUDENTS_COLLECTION, regNoUpper);
      batch.delete(ref);
      success++;
    } catch (err) {
      errors.push(`Delete ${regNo}: ${err}`);
    }
  });

  try {
    await batch.commit();
    return { success, errors };
  } catch (err: any) {
    errors.push(`Batch commit failed: ${err.message}`);
    return { success: 0, errors };
  }
};

export const bulkDeleteStudents = async (
  regNos: string[],
  onProgress?: (progress: { current: number; total: number; percent: number }) => void,
): Promise<{ success: number; failed: number; errors: string[] }> => {
  const chunks = chunkArray(regNos, BATCH_SIZE);
  const allErrors: string[] = [];
  let totalSuccess = 0;

  for (let i = 0; i < chunks.length; i++) {
    const result = await processDeleteBatch(chunks[i]);
    totalSuccess += result.success;
    allErrors.push(...result.errors);

    if (onProgress) {
      const processed = Math.min((i + 1) * BATCH_SIZE, regNos.length);
      onProgress({
        current: processed,
        total: regNos.length,
        percent: Math.round((processed / regNos.length) * 100),
      });
    }
  }

  return {
    success: totalSuccess,
    failed: allErrors.length,
    errors: allErrors,
  };
};

/**
 * Update student categories only
 */
export const updateStudentCategories = async (
  regNo: string,
  categories: { od?: boolean; scholarship?: boolean },
): Promise<void> => {
  const regNoUpper = regNo.toUpperCase().trim();
  const ref = doc(db, STUDENTS_COLLECTION, regNoUpper);
  await updateDoc(ref, { 
    categories, 
    updatedAt: new Date(),
  });
};

/**
 * Advanced search with filters
 * Supports partial matching and field-specific search
 */
export const advancedSearchStudents = async (filters: {
  searchField: 'all' | 'regNo' | 'name' | 'committee' | 'department' | 'hostel' | 'phone';
  searchQuery: string;
  categoryFilter: 'all' | 'od' | 'scholarship' | 'none';
}): Promise<Student[]> => {
  try {
    const allStudents = await getAllStudents();
    const query = filters.searchQuery.toLowerCase().trim();
    
    let results = allStudents;
    
    // Apply text search filter
    if (query) {
      results = results.filter((student) => {
        switch (filters.searchField) {
          case 'regNo':
            return student.regNo.toLowerCase().includes(query);
          case 'name':
            return student.name.toLowerCase().includes(query);
          case 'committee':
            return student.committee?.toLowerCase().includes(query);
          case 'department':
            return student.department?.toLowerCase().includes(query);
          case 'hostel':
            return student.hostel?.toLowerCase().includes(query);
          case 'phone':
            return student.phoneNumber?.toLowerCase().includes(query);
          case 'all':
          default:
            // Search across all fields
            return (
              student.regNo.toLowerCase().includes(query) ||
              student.name.toLowerCase().includes(query) ||
              student.committee?.toLowerCase().includes(query) ||
              student.department?.toLowerCase().includes(query) ||
              student.hostel?.toLowerCase().includes(query) ||
              student.phoneNumber?.toLowerCase().includes(query) ||
              student.roomNumber?.toLowerCase().includes(query)
            );
        }
      });
    }
    
    // Apply category filter
    if (filters.categoryFilter !== 'all') {
      results = results.filter((student) => {
        const hasOd = student.categories?.od === true;
        const hasScholarship = student.categories?.scholarship === true;
        
        switch (filters.categoryFilter) {
          case 'od':
            return hasOd;
          case 'scholarship':
            return hasScholarship;
          case 'none':
            return !hasOd && !hasScholarship;
          default:
            return true;
        }
      });
    }
    
    return results;
  } catch (error) {
    console.error('advancedSearchStudents error:', error);
    return [];
  }
};

/**
 * Get attendance for a student
 */
export const getStudentAttendance = async (regNo: string): Promise<StudentAttendance | null> => {
  try {
    const regNoUpper = regNo.toUpperCase().trim();
    const ref = doc(db, STUDENTS_COLLECTION, regNoUpper, 'attendance', 'records');
    const snap = await getDoc(ref);

    if (snap.exists()) {
      const data = snap.data() as StudentAttendance;
      return calculateAttendanceStats(data);
    }
    
    // Return empty attendance if none exists
    return {
      regNo: regNoUpper,
      records: [],
      totalPresent: 0,
      totalAbsent: 0,
      totalOD: 0,
      totalLeave: 0,
      attendancePercentage: 0,
    };
  } catch (error) {
    console.error('getStudentAttendance error:', error);
    return null;
  }
};

/**
 * Update/Add attendance records for a student
 */
export const updateStudentAttendance = async (
  regNo: string,
  records: AttendanceRecord[],
  markedByUid: string
): Promise<void> => {
  const regNoUpper = regNo.toUpperCase().trim();
  const ref = doc(db, STUDENTS_COLLECTION, regNoUpper, 'attendance', 'records');

  // Add metadata to records
  const updatedRecords = records.map(record => ({
    ...record,
    markedBy: markedByUid,
    markedAt: new Date(),
  }));

  const attendanceData: StudentAttendance = {
    regNo: regNoUpper,
    records: updatedRecords,
  };

  await setDoc(ref, calculateAttendanceStats(attendanceData), { merge: true });
};

/**
 * Add single attendance record
 */
export const addAttendanceRecord = async (
  regNo: string,
  record: AttendanceRecord,
  markedByUid: string
): Promise<void> => {
  const regNoUpper = regNo.toUpperCase().trim();
  const ref = doc(db, STUDENTS_COLLECTION, regNoUpper, 'attendance', 'records');
  
  // Get existing attendance
  const existing = await getStudentAttendance(regNoUpper);
  const existingRecords = existing?.records || [];
  
  // Check if date already exists, if so update it, otherwise add new
  const dateIndex = existingRecords.findIndex(r => r.date === record.date);
  
  if (dateIndex >= 0) {
    existingRecords[dateIndex] = {
      ...record,
      markedBy: markedByUid,
      markedAt: new Date(),
    };
  } else {
    existingRecords.push({
      ...record,
      markedBy: markedByUid,
      markedAt: new Date(),
    });
  }
  
  // Sort by date (newest first)
  existingRecords.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  
  const attendanceData: StudentAttendance = {
    regNo: regNoUpper,
    records: existingRecords,
  };

  await setDoc(ref, calculateAttendanceStats(attendanceData), { merge: true });
};

/**
 * Delete attendance record by date
 */
export const deleteAttendanceRecord = async (
  regNo: string,
  date: string
): Promise<void> => {
  const regNoUpper = regNo.toUpperCase().trim();
  const ref = doc(db, STUDENTS_COLLECTION, regNoUpper, 'attendance', 'records');
  
  const existing = await getStudentAttendance(regNoUpper);
  if (!existing) return;
  
  const updatedRecords = existing.records.filter(r => r.date !== date);
  
  const attendanceData: StudentAttendance = {
    regNo: regNoUpper,
    records: updatedRecords,
  };

  await setDoc(ref, calculateAttendanceStats(attendanceData), { merge: true });
};

/**
 * Calculate attendance statistics
 */
const calculateAttendanceStats = (attendance: StudentAttendance): StudentAttendance => {
  const records = attendance.records || [];
  
  const totalPresent = records.filter(r => r.status === 'present').length;
  const totalAbsent = records.filter(r => r.status === 'absent').length;
  const totalOD = records.filter(r => r.status === 'od').length;
  const totalLeave = records.filter(r => r.status === 'leave').length;
  
  const totalDays = records.length;
  const attendancePercentage = totalDays > 0 
    ? Math.round(((totalPresent + totalOD) / totalDays) * 100) 
    : 0;
  
  return {
    ...attendance,
    totalPresent,
    totalAbsent,
    totalOD,
    totalLeave,
    attendancePercentage,
  };
};

/**
 * Bulk add attendance for multiple students on a specific date
 */
export const bulkMarkAttendance = async (
  attendanceData: { regNo: string; status: 'present' | 'absent' | 'od' | 'leave'; remarks?: string }[],
  date: string,
  markedByUid: string,
  onProgress?: (progress: { current: number; total: number; percent: number }) => void
): Promise<{ success: number; failed: number; errors: string[] }> => {
  const errors: string[] = [];
  let success = 0;
  
  for (let i = 0; i < attendanceData.length; i++) {
    try {
      const { regNo, status, remarks } = attendanceData[i];
      
      await addAttendanceRecord(
        regNo,
        { date, status, remarks },
        markedByUid
      );
      
      success++;
      
      if (onProgress) {
        onProgress({
          current: i + 1,
          total: attendanceData.length,
          percent: Math.round(((i + 1) / attendanceData.length) * 100),
        });
      }
    } catch (err: any) {
      errors.push(`${attendanceData[i].regNo}: ${err.message}`);
    }
  }
  
  return {
    success,
    failed: errors.length,
    errors,
  };
};
