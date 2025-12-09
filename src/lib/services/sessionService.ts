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
  updateDoc,
  arrayRemove,
  arrayUnion,
  arrayUnion as arrayPush,
} from 'firebase/firestore';
import { db } from '../firebase/config';

export interface SessionConfig {
  id?: string;
  dateKey: string;
  sessionCount: number;
  sessionNames: string[];
  activeSessions: string[]; // Tracks which sessions are active
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
    activeSessions: Array.from({ length: sessionCount }, (_, i) => `session-${i}`),
    createdBy: adminUid,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await setDoc(docRef, config, { merge: true });
};

/**
 * Toggle individual session active/inactive
 */
export const toggleSessionActive = async (
  dateKey: string,
  sessionIndex: number,
  isActive: boolean,
): Promise<void> => {
  const docRef = doc(db, SESSIONS_COLLECTION, dateKey);
  
  if (isActive) {
    await updateDoc(docRef, {
      ['activeSessions']: arrayUnion(`session-${sessionIndex}`),
      updatedAt: new Date(),
    });
  } else {
    await updateDoc(docRef, {
      ['activeSessions']: arrayRemove(`session-${sessionIndex}`),
      updatedAt: new Date(),
    });
  }
};

/**
 * Delete individual session (remove from array and shift indices)
 */
export const deleteIndividualSession = async (
  dateKey: string,
  sessionIndex: number,
): Promise<void> => {
  const docRef = doc(db, SESSIONS_COLLECTION, dateKey);
  
  // Get current config first
  const configSnap = await getDoc(docRef);
  if (!configSnap.exists()) return;

  const config = configSnap.data() as SessionConfig;
  
  // Remove session from names and active sessions
  const newSessionNames = config.sessionNames.filter((_, idx) => idx !== sessionIndex);
  const newActiveSessions = config.activeSessions
    ?.map(id => {
      const idx = parseInt(id.split('-')[1]);
      return idx !== sessionIndex ? id : null;
    })
    .filter(Boolean) as string[];

  // Update document with new arrays and update indices
  await updateDoc(docRef, {
    sessionNames: newSessionNames,
    sessionCount: newSessionNames.length,
    activeSessions: newActiveSessions,
    updatedAt: new Date(),
  });
};

/**
 * Reorder sessions
 */
export const reorderSessions = async (
  dateKey: string,
  newSessionNames: string[],
): Promise<void> => {
  const docRef = doc(db, SESSIONS_COLLECTION, dateKey);
  await updateDoc(docRef, {
    sessionNames: newSessionNames,
    updatedAt: new Date(),
  });
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
 * Delete entire session configuration
 */
export const deleteSessionConfig = async (dateKey: string): Promise<void> => {
  const docRef = doc(db, SESSIONS_COLLECTION, dateKey);
  await deleteDoc(docRef);
};
