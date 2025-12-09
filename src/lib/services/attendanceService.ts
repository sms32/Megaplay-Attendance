// lib/services/attendanceService.ts
import {
  collection,
  doc,
  addDoc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
  writeBatch,
  limit,
  updateDoc,
  deleteDoc,       
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { Student } from './studentService';

export interface AttendanceRecord {
  id?: string;
  regNo: string;
  studentName: string;
  committee?: string;
  category: 'od' | 'scholarship' | 'lab';
  coordinatorUid: string;
  coordinatorEmail: string;
  timestamp: any;
  dateKey: string; // Format: YYYY-MM-DD
  sessionId: string; // e.g., "2025-12-09-session-1"
  sessionName: string; // e.g., "Morning Session"
  sessionIndex: number; // 0, 1, 2, etc.
  hostel?: string;
  roomNumber?: string;
  department?: string;
  phoneNumber?: string;

  // ✅ NEW: Audit fields from updated version
  previousCategory?: 'od' | 'scholarship' | 'lab';
  lastUpdatedByUid?: string;
  lastUpdatedByEmail?: string;
  lastUpdatedAt?: any;
}

export const ATTENDANCE_COLLECTION = 'attendance';

// In-memory cache for duplicate checks (session lifetime) - UPDATED to session-level only
const duplicateCache = new Map<string, Set<string>>();

/**
 * Mark attendance for a student with session (LEGACY - use markAttendanceFast)
 */
/**
 * Mark attendance for a student with session (LEGACY - use markAttendanceFast)
 */
export const markAttendance = async (
  student: Student,
  category: 'od' | 'scholarship' | 'lab',
  coordinatorUid: string,
  coordinatorEmail: string,
  dateKey: string,
  sessionIndex: number,
  sessionName: string,
): Promise<AttendanceRecord> => {
  const sessionId = `${dateKey}-session-${sessionIndex}`;
  const regNoUpper = student.regNo.toUpperCase(); // ✅ FIXED: Add this line

  const record: AttendanceRecord = {
    regNo: regNoUpper,
    studentName: student.name,
    category,
    coordinatorUid,
    coordinatorEmail,
    timestamp: serverTimestamp(),
    dateKey,
    sessionId,
    sessionName,
    sessionIndex,
    ...(student.department && { department: student.department }),
    ...(student.committee && { committee: student.committee }),
    ...(student.hostel && { hostel: student.hostel }),
    ...(student.roomNumber && { roomNumber: student.roomNumber }),
    ...(student.phoneNumber && { phoneNumber: student.phoneNumber }),
  };

  const ref = collection(db, ATTENDANCE_COLLECTION);
  const docRef = await addDoc(ref, record);

  return {
    ...record,
    id: docRef.id,
    timestamp: new Date(),
  };
};


/**
 * ⚡ OPTIMIZED: Mark attendance with immediate cache update (UPDATED with new cache logic)
 */
export const markAttendanceFast = async (
  student: Student,
  category: 'od' | 'scholarship' | 'lab',
  coordinatorUid: string,
  coordinatorEmail: string,
  dateKey: string,
  sessionIndex: number,
  sessionName: string,
): Promise<AttendanceRecord> => {
  const regNoUpper = student.regNo.toUpperCase();
  const sessionId = `${dateKey}-session-${sessionIndex}`;

  const base: AttendanceRecord = {
    regNo: regNoUpper,
    studentName: student.name,
    category,
    coordinatorUid,
    coordinatorEmail,
    timestamp: serverTimestamp(),
    dateKey,
    sessionId,
    sessionName,
    sessionIndex,
  };

  const record: AttendanceRecord = {
    ...base,
    ...(student.department && { department: student.department }),
    ...(student.committee && { committee: student.committee }),
    ...(student.hostel && { hostel: student.hostel }),
    ...(student.roomNumber && { roomNumber: student.roomNumber }),
    ...(student.phoneNumber && { phoneNumber: student.phoneNumber }),
  };

  const ref = collection(db, ATTENDANCE_COLLECTION);
  const docRef = await addDoc(ref, record);

  // update cache as before
  if (!duplicateCache.has(sessionId)) {
    duplicateCache.set(sessionId, new Set());
  }
  duplicateCache.get(sessionId)!.add(regNoUpper);

  return {
    ...record,
    id: docRef.id,
    timestamp: new Date(),
  };
};


/**
 * Check if student already marked for session (LEGACY - use hasAnyAttendanceInSession)
 */
export const checkDuplicateSession = async (
  regNo: string,
  category: 'od' | 'scholarship' | 'lab',
  sessionId: string,
): Promise<boolean> => {
  try {
    const ref = collection(db, ATTENDANCE_COLLECTION);
    const q = query(
      ref,
      where('regNo', '==', regNo.toUpperCase()),
      where('category', '==', category),
      where('sessionId', '==', sessionId),
      limit(1),
    );

    const snap = await getDocs(q);
    return !snap.empty;
  } catch (error) {
    console.error('checkDuplicateSession error:', error);
    return false;
  }
};

/**
 * ⚡ OPTIMIZED: Check if student has ANY attendance in session (replaces checkDuplicateSessionFast)
 */
export const hasAnyAttendanceInSession = async (
  regNo: string,
  sessionId: string,
): Promise<boolean> => {
  const regNoUpper = regNo.toUpperCase();

  // If cache says no record, we can skip query
  const cachedSet = duplicateCache.get(sessionId);
  if (cachedSet && !cachedSet.has(regNoUpper)) {
    return false;
  }

  const ref = collection(db, ATTENDANCE_COLLECTION);
  const q = query(
    ref,
    where('sessionId', '==', sessionId),
    where('regNo', '==', regNoUpper),
    limit(1),
  );
  const snap = await getDocs(q);

  // Cache miss → cache the result
  if (snap.empty) {
    if (!duplicateCache.has(sessionId)) {
      duplicateCache.set(sessionId, new Set());
    }
    duplicateCache.get(sessionId)!.add(regNoUpper); // Cache negative result? No, only positives
  }

  return !snap.empty;
};

/**
 * Find existing attendance for a student in a session (any category). Returns ONE record or null.
 */
export const findExistingAttendance = async (
  regNo: string,
  sessionId: string,
): Promise<AttendanceRecord | null> => {
  const regNoUpper = regNo.toUpperCase();

  // If cache says no record, we can skip query
  const cachedSet = duplicateCache.get(sessionId);
  if (cachedSet && !cachedSet.has(regNoUpper)) {
    return null;
  }

  const ref = collection(db, ATTENDANCE_COLLECTION);
  const q = query(
    ref,
    where('sessionId', '==', sessionId),
    where('regNo', '==', regNoUpper),
    limit(1),
  );
  const snap = await getDocs(q);

  if (snap.empty) {
    return null;
  }

  const docSnap = snap.docs[0];
  return { id: docSnap.id, ...(docSnap.data() as AttendanceRecord) };
};

/**
 * ⚡ OPTIMIZED: Preload session attendance into cache on session start (UPDATED)
 * Call this when coordinator starts a session to warm up the cache
 */
export const preloadSessionCache = async (
  coordinatorUid: string,
  category: 'od' | 'scholarship' | 'lab' | 'all',
  sessionId: string,
): Promise<void> => {
  try {
    const ref = collection(db, ATTENDANCE_COLLECTION);

    let q;
    if (category === 'all') {
      q = query(
        ref,
        where('sessionId', '==', sessionId),
        orderBy('timestamp', 'desc'),
      );
    } else {
      q = query(
        ref,
        where('sessionId', '==', sessionId),
        where('category', '==', category),
        orderBy('timestamp', 'desc'),
      );
    }

    const snap = await getDocs(q);
    const records: AttendanceRecord[] = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as AttendanceRecord),
    }));

    // Warm duplicate cache (session-level)
    const set = new Set<string>();
    records.forEach((r) => set.add(r.regNo.toUpperCase()));
    duplicateCache.set(sessionId, set);

    console.log(`✅ Preloaded ${set.size} records into cache for ${sessionId}`);
  } catch (error) {
    console.error('preloadSessionCache error:', error);
  }
};

/**
 * Clear cache for a session (call when changing sessions) - UPDATED
 */
export const clearSessionCache = (sessionId?: string) => {
  if (sessionId) {
    // Clear specific session
    duplicateCache.delete(sessionId);
  } else {
    // Clear all
    duplicateCache.clear();
  }
};

/**
 * Get today's attendance for coordinator + category + optional session
 */
export const getTodayAttendance = async (
  coordinatorUid: string,
  category: 'od' | 'scholarship' | 'lab',
  dateKey: string,
  sessionId?: string,
): Promise<AttendanceRecord[]> => {
  try {
    const ref = collection(db, ATTENDANCE_COLLECTION);
    const constraints: any[] = [
      where('coordinatorUid', '==', coordinatorUid),
      where('category', '==', category),
      where('dateKey', '==', dateKey),
    ];

    if (sessionId) {
      constraints.push(where('sessionId', '==', sessionId));
    }

    constraints.push(orderBy('timestamp', 'desc'));

    const q = query(ref, ...constraints);
    const snap = await getDocs(q);

    return snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    } as AttendanceRecord));
  } catch (error) {
    console.error('getTodayAttendance error:', error);
    return [];
  }
};

/**
 * Get session attendance for coordinator (used for live table updates) - UPDATED
 */
export const getSessionAttendance = async (
  coordinatorUid: string,
  category: 'od' | 'scholarship' | 'lab' | 'all',
  sessionId: string,
): Promise<AttendanceRecord[]> => {
  try {
    const ref = collection(db, ATTENDANCE_COLLECTION);

    let q;
    if (category === 'all') {
      q = query(
        ref,
        where('sessionId', '==', sessionId),
        orderBy('timestamp', 'desc'),
      );
    } else {
      q = query(
        ref,
        where('sessionId', '==', sessionId),
        where('category', '==', category),
        orderBy('timestamp', 'desc'),
      );
    }

    const snap = await getDocs(q);
    const records: AttendanceRecord[] = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as AttendanceRecord),
    }));

    // Warm duplicate cache (session-level)
    const set = new Set<string>();
    records.forEach((r) => set.add(r.regNo.toUpperCase()));
    duplicateCache.set(sessionId, set);

    return records;
  } catch (error) {
    console.error('getSessionAttendance error:', error);
    return [];
  }
};

/**
 * Get all attendance for a date + category (admin view)
 */
export const getAttendanceByDateCategory = async (
  dateKey: string,
  category: 'od' | 'scholarship' | 'lab',
  sessionId?: string,
): Promise<AttendanceRecord[]> => {
  try {
    const ref = collection(db, ATTENDANCE_COLLECTION);
    const constraints: any[] = [
      where('dateKey', '==', dateKey),
      where('category', '==', category),
    ];

    if (sessionId) {
      constraints.push(where('sessionId', '==', sessionId));
    }

    constraints.push(orderBy('timestamp', 'asc'));

    const q = query(ref, ...constraints);
    const snap = await getDocs(q);

    return snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    } as AttendanceRecord));
  } catch (error) {
    console.error('getAttendanceByDateCategory error:', error);
    return [];
  }
};

/**
 * Admin: Get attendance with multiple filters including session
 */
export const getAttendanceAdmin = async ({
  dateKey,
  category,
  coordinatorUid,
  sessionId,
}: {
  dateKey: string;
  category?: 'od' | 'scholarship' | 'lab';
  coordinatorUid?: string;
  sessionId?: string;
}): Promise<AttendanceRecord[]> => {
  try {
    const ref = collection(db, ATTENDANCE_COLLECTION);
    const constraints: any[] = [where('dateKey', '==', dateKey)];

    if (category) {
      constraints.push(where('category', '==', category));
    }
    if (coordinatorUid) {
      constraints.push(where('coordinatorUid', '==', coordinatorUid));
    }
    if (sessionId) {
      constraints.push(where('sessionId', '==', sessionId));
    }

    constraints.push(orderBy('timestamp', 'asc'));

    const q = query(ref, ...constraints);
    const snap = await getDocs(q);

    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as AttendanceRecord));
  } catch (error) {
    console.error('getAttendanceAdmin error:', error);
    return [];
  }
};

/**
 * Get all unique sessions for a date + category (helper for UI)
 */
export const getSessionsByDateCategory = async (
  dateKey: string,
  category: 'od' | 'scholarship' | 'lab',
): Promise<{ sessionId: string; sessionName: string }[]> => {
  try {
    const ref = collection(db, ATTENDANCE_COLLECTION);
    const q = query(
      ref,
      where('dateKey', '==', dateKey),
      where('category', '==', category),
    );

    const snap = await getDocs(q);
    const sessionsMap = new Map<string, string>();

    snap.docs.forEach((doc) => {
      const data = doc.data() as AttendanceRecord;
      if (data.sessionId && !sessionsMap.has(data.sessionId)) {
        sessionsMap.set(data.sessionId, data.sessionName || data.sessionId);
      }
    });

    return Array.from(sessionsMap.entries()).map(([sessionId, sessionName]) => ({
      sessionId,
      sessionName,
    }));
  } catch (error) {
    console.error('getSessionsByDateCategory error:', error);
    return [];
  }
};

/**
 * ✅ NEW: Update category for an existing attendance record (used for mode change)
 */
export const updateAttendanceCategory = async (
  recordId: string,
  newCategory: 'od' | 'scholarship' | 'lab',
  updaterUid: string,
  updaterEmail: string,
): Promise<void> => {
  const ref = doc(db, ATTENDANCE_COLLECTION, recordId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data() as AttendanceRecord;

  await updateDoc(ref, {
    category: newCategory,
    previousCategory: data.category,
    lastUpdatedByUid: updaterUid,
    lastUpdatedByEmail: updaterEmail,
    lastUpdatedAt: serverTimestamp(),
  });
};

/**
 * Delete a single attendance record and update cache - UPDATED
 */
export const deleteAttendanceRecord = async (
  id: string,
  regNo: string,
  category: 'od' | 'scholarship' | 'lab',
  sessionId: string,
): Promise<void> => {
  // 1. Delete from Firestore
  const ref = doc(db, ATTENDANCE_COLLECTION, id);
  await deleteDoc(ref);

  // 2. Update in-memory duplicate cache (session-level)
  const set = duplicateCache.get(sessionId);
  if (set) {
    set.delete(regNo.toUpperCase());
  }
};
export const checkDuplicateSessionFast = async (
  regNo: string,
  category: 'od' | 'scholarship' | 'lab',
  sessionId: string,
): Promise<boolean> => {
  const cacheKey = `${sessionId}-${category}`;

  // Initialize cache if doesn't exist
  if (!duplicateCache.has(cacheKey)) {
    duplicateCache.set(cacheKey, new Set());
  }

  const cache = duplicateCache.get(cacheKey)!;
  const normalizedRegNo = regNo.toUpperCase();

  // Check in-memory cache first (instant - 0ms)
  if (cache.has(normalizedRegNo)) {
    return true;
  }

  // Check Firestore only once (slower - 100-300ms)
  try {
    const ref = collection(db, ATTENDANCE_COLLECTION);
    const q = query(
      ref,
      where('regNo', '==', normalizedRegNo),
      where('category', '==', category),
      where('sessionId', '==', sessionId),
      limit(1), // Only need to know if exists
    );

    const snap = await getDocs(q);
    const isDuplicate = !snap.empty;

    // Add to cache for future instant checks
    if (isDuplicate) {
      cache.add(normalizedRegNo);
    }

    return isDuplicate;
  } catch (error) {
    console.error('checkDuplicateSessionFast error:', error);
    return false;
  }
};