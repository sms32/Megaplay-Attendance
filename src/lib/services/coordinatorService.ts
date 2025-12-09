// lib/services/coordinatorService.ts
import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy,
  getDoc,
} from 'firebase/firestore';
import { db } from '../firebase/config';

export interface Coordinator {
  id: string;
  email: string;
  role: 'coordinator' | 'admin';
  createdAt?: any;
  createdBy?: string;
}

const COORDINATORS_COLLECTION = 'coordinators';

export const getAllCoordinators = async (): Promise<Coordinator[]> => {
  try {
    const ref = collection(db, COORDINATORS_COLLECTION);
    const q = query(ref, orderBy('email'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    } as Coordinator));
  } catch (error: any) {
    console.warn('getAllCoordinators error:', error.message);
    return []; // Return empty array, don't crash
  }
};

export const addCoordinator = async (
  email: string,
  createdByUid: string,
  role: 'coordinator' | 'admin' = 'coordinator',
): Promise<void> => {
  const emailLower = email.toLowerCase().trim();
  const ref = doc(db, COORDINATORS_COLLECTION, emailLower);
  
  await setDoc(ref, {
    email: emailLower,
    role,
    createdAt: serverTimestamp(),
    createdBy: createdByUid,
  }, { merge: true });
};

export const deleteCoordinator = async (email: string): Promise<void> => {
  const emailLower = email.toLowerCase().trim();
  const ref = doc(db, COORDINATORS_COLLECTION, emailLower);
  await deleteDoc(ref);
};

export const isCoordinatorEmail = async (email: string): Promise<boolean> => {
  try {
    const emailLower = email.toLowerCase().trim();
    const ref = doc(db, COORDINATORS_COLLECTION, emailLower);
    const snap = await getDoc(ref);
    return snap.exists();
  } catch (error) {
    console.warn('isCoordinatorEmail error:', error);
    return false;
  }
};
