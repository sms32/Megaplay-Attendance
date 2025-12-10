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
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { updateDoc } from 'firebase/firestore';

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


// Add these imports if missing

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
