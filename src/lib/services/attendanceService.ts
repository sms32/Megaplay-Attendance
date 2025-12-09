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

  // ✅ AUDIT FIELDS: Track category changes
  previousCategory?: 'od' | 'scholarship' | 'lab';
  lastUpdatedByUid?: string;
  lastUpdatedByEmail?: string;
  lastUpdatedAt?: any;
}

export const ATTENDANCE_COLLECTION = 'attendance';

// ✅ ADVANCED: SINGLE SESSION-LEVEL CACHE (sessionId → Set<regNo>)
const duplicateCache = new Map<string, Set<string>>();

/**
 * ⚡ ULTRA-FAST: Mark attendance with SESSION-LEVEL cache update
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

  // ✅ SESSION-LEVEL CACHE: Track ALL students in this session
  if (!duplicateCache.has(sessionId)) {
    duplicateCache.set(sessionId, new Set());
  }
  duplicateCache.get(sessionId)!.add(regNoUpper);

  console.log(`✅ NEW: ${regNoUpper} marked ${category.toUpperCase()} in ${sessionId}`);
  
  return {
    ...record,
    id: docRef.id,
    timestamp: new Date(),
  };
};

/**
 * ⚡ ULTRA-FAST: Check if student has ANY attendance in session (ALL categories)
 */
export const hasAnyAttendanceInSession = async (
  regNo: string,
  sessionId: string,
): Promise<boolean> => {
  const regNoUpper = regNo.toUpperCase();

  // ⚡ INSTANT CACHE HIT (0ms)
  const cachedSet = duplicateCache.get(sessionId);
  if (cachedSet && !cachedSet.has(regNoUpper)) {
    return false;
  }

  // Firestore query (100-300ms, cached after)
  const ref = collection(db, ATTENDANCE_COLLECTION);
  const q = query(
    ref,
    where('sessionId', '==', sessionId),
    where('regNo', '==', regNoUpper),
    limit(1),
  );
  const snap = await getDocs(q);

  // ✅ CACHE BOTH POSITIVE & NEGATIVE RESULTS
  if (!duplicateCache.has(sessionId)) {
    duplicateCache.set(sessionId, new Set());
  }
  if (!snap.empty) {
    duplicateCache.get(sessionId)!.add(regNoUpper);
  }

  return !snap.empty;
};

/**
 * ⚡ PERFECT: Find existing attendance record (ANY category, latest first)
 */
export const findExistingAttendance = async (
  regNo: string,
  sessionId: string,
): Promise<AttendanceRecord | null> => {
  const regNoUpper = regNo.toUpperCase();

  // ⚡ INSTANT CACHE HIT
  const cachedSet = duplicateCache.get(sessionId);
  if (cachedSet && !cachedSet.has(regNoUpper)) {
    return null;
  }

  const ref = collection(db, ATTENDANCE_COLLECTION);
  const q = query(
    ref,
    where('sessionId', '==', sessionId),
    where('regNo', '==', regNoUpper),
    orderBy('timestamp', 'desc'),
    limit(1),
  );
  const snap = await getDocs(q);

  if (snap.empty) {
    return null;
  }

  const docSnap = snap.docs[0];
  return { 
    id: docSnap.id, 
    ...(docSnap.data() as AttendanceRecord) 
  };
};

/**
 * ⚡ ADVANCED: Preload ALL session records into cache (ALL categories)
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
      // ✅ LOAD ALL CATEGORIES: LAB + OD + Scholarship
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

    // ✅ SESSION-LEVEL CACHE: ALL regNos for this session
    const set = new Set<string>();
    records.forEach((r) => set.add(r.regNo.toUpperCase()));
    duplicateCache.set(sessionId, set);

    console.log(`✅ CACHED ${set.size} students for ${sessionId} (${category})`);
  } catch (error) {
    console.error('preloadSessionCache error:', error);
  }
};

/**
 * ⚡ PERFECT: Get session attendance (supports 'all' for combined OD/Scholarship)
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
      // ✅ OD/SCHOLARSHIP PAGE: Show BOTH categories
      q = query(
        ref,
        where('sessionId', '==', sessionId),
        where('category', 'in', ['od', 'scholarship']),
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

    // Warm SESSION-LEVEL cache
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
 * ✅ SEAMLESS: Update category (LAB ↔ OD/Scholarship)
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

  console.log(`✅ CHANGED: ${data.regNo} ${data.category.toUpperCase()} → ${newCategory.toUpperCase()}`);
};

/**
 * ⚡ CLEANUP: Delete record + update cache
 */
export const deleteAttendanceRecord = async (
  id: string,
  regNo: string,
  category: 'od' | 'scholarship' | 'lab',
  sessionId: string,
): Promise<void> => {
  // 1. Firestore delete
  const ref = doc(db, ATTENDANCE_COLLECTION, id);
  await deleteDoc(ref);

  // 2. Remove from SESSION cache
  const set = duplicateCache.get(sessionId);
  if (set) {
    set.delete(regNo.toUpperCase());
    if (set.size === 0) {
      duplicateCache.delete(sessionId);
    }
  }

  console.log(`✅ DELETED: ${regNo} from ${sessionId}`);
};

/**
 * ✅ RESET: Clear session cache
 */
export const clearSessionCache = (sessionId?: string) => {
  if (sessionId) {
    duplicateCache.delete(sessionId);
  } else {
    duplicateCache.clear();
  }
};

/**
 * 📊 ADMIN: Get all attendance with filters
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

    if (category) constraints.push(where('category', '==', category));
    if (coordinatorUid) constraints.push(where('coordinatorUid', '==', coordinatorUid));
    if (sessionId) constraints.push(where('sessionId', '==', sessionId));

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
 * 🧹 UTILITY: Clear ALL caches (logout/page change)
 */
export const clearAllCaches = () => {
  duplicateCache.clear();
  console.log('🧹 ALL caches cleared');
};

// ✅ DEPRECATED: Backward compatibility (logs warning)
export const checkDuplicateSessionFast = async (
  regNo: string,
  category: 'od' | 'scholarship' | 'lab',
  sessionId: string,
): Promise<boolean> => {
  console.warn('⚠️ DEPRECATED: Use hasAnyAttendanceInSession() instead');
  return hasAnyAttendanceInSession(regNo, sessionId);
};

// ✅ BACKWARD COMPATIBILITY: Legacy functions
export const markAttendance = markAttendanceFast; // Alias
export const getTodayAttendance = async (
  coordinatorUid: string,
  category: 'od' | 'scholarship' | 'lab',
  dateKey: string,
  sessionId?: string,
): Promise<AttendanceRecord[]> => {
  const records = await getAttendanceAdmin({ dateKey, category, coordinatorUid, sessionId });
  return records.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
};

export const getAttendanceByDateCategory = async (
  dateKey: string,
  category: 'od' | 'scholarship' | 'lab',
  sessionId?: string,
): Promise<AttendanceRecord[]> => {
  const records = await getAttendanceAdmin({ dateKey, category, sessionId });
  return records.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
};

export const getSessionsByDateCategory = async (
  dateKey: string,
  category: 'od' | 'scholarship' | 'lab',
): Promise<{ sessionId: string; sessionName: string }[]> => {
  try {
    const ref = collection(db, ATTENDANCE_COLLECTION);
    const q = query(ref, where('dateKey', '==', dateKey), where('category', '==', category));
    const snap = await getDocs(q);
    const sessionsMap = new Map<string, string>();

    snap.docs.forEach((doc) => {
      const data = doc.data() as AttendanceRecord;
      if (data.sessionId && !sessionsMap.has(data.sessionId)) {
        sessionsMap.set(data.sessionId, data.sessionName);
      }
    });

    return Array.from(sessionsMap.entries());
  } catch (error) {
    console.error('getSessionsByDateCategory error:', error);
    return [];
  }
};

export const checkDuplicateSession = async (
  regNo: string,
  category: 'od' | 'scholarship' | 'lab',
  sessionId: string,
): Promise<boolean> => {
  console.warn('⚠️ DEPRECATED: Use hasAnyAttendanceInSession()');
  return hasAnyAttendanceInSession(regNo, sessionId);
};
