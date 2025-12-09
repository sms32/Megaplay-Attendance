// lib/services/sessionService.ts
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  deleteDoc,
} from 'firebase/firestore';
import { db } from '../firebase/config';

export interface SessionConfig {
  id?: string; // Format: YYYY-MM-DD (the date itself)
  dateKey: string; // YYYY-MM-DD
  sessionCount: number;
  sessionNames: string[]; // e.g., ["Session 1", "Session 2", "Morning", "Afternoon"]
  createdBy: string;
  createdAt: any;
  updatedAt?: any;
}

const SESSIONS_COLLECTION = 'sessions';

/**
 * Create or update session configuration for a date
 */
export const setSessionConfig = async (
  dateKey: string,
  sessionCount: number,
  sessionNames: string[],
  adminUid: string,
): Promise<void> => {
  const docRef = doc(db, SESSIONS_COLLECTION, dateKey);

  const config: SessionConfig = {
    dateKey,
    sessionCount,
    sessionNames,
    createdBy: adminUid,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await setDoc(docRef, config, { merge: true });
};

/**
 * Get session configuration for a specific date
 */
export const getSessionConfig = async (dateKey: string): Promise<SessionConfig | null> => {
  try {
    const docRef = doc(db, SESSIONS_COLLECTION, dateKey);
    const snap = await getDoc(docRef);

    if (!snap.exists()) return null;

    return { id: snap.id, ...snap.data() } as SessionConfig;
  } catch (error) {
    console.error('getSessionConfig error:', error);
    return null;
  }
};

/**
 * Get all session configurations (for admin view)
 */
export const getAllSessionConfigs = async (): Promise<SessionConfig[]> => {
  try {
    const ref = collection(db, SESSIONS_COLLECTION);
    const q = query(ref, orderBy('dateKey', 'desc'));
    const snap = await getDocs(q);

    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as SessionConfig));
  } catch (error) {
    console.error('getAllSessionConfigs error:', error);
    return [];
  }
};

/**
 * Delete session configuration
 */
export const deleteSessionConfig = async (dateKey: string): Promise<void> => {
  const docRef = doc(db, SESSIONS_COLLECTION, dateKey);
  await deleteDoc(docRef);
};
