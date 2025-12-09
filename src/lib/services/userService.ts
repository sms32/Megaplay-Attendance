// lib/services/userService.ts
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { User } from 'firebase/auth';
import { isCoordinatorEmail } from './coordinatorService';
import { isAdmin } from '../utils/adminCheck';

export interface UserData {
  uid: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
  createdAt: any;
  lastLogin: any;
  role: 'student' | 'coordinator' | 'admin'; // Updated
  isActive: boolean;
  preferences: {
    notifications: boolean;
    theme: 'light' | 'dark';
  };
}

export const createOrUpdateUserDocument = async (user: User): Promise<UserData> => {
  const userRef = doc(db, 'users', user.uid);
  
  try {
    const userDoc = await getDoc(userRef);
    
    // Determine role from coordinators collection + admin check
    const isCoordinator = await isCoordinatorEmail(user.email || '');
    const isSuperAdmin = isAdmin(user.email);
    const role = isSuperAdmin ? 'admin' : (isCoordinator ? 'coordinator' : 'student');
    
    if (!userDoc.exists()) {
      const userData: UserData = {
        uid: user.uid,
        email: user.email || '',
        displayName: user.displayName,
        photoURL: user.photoURL,
        createdAt: serverTimestamp(),
        lastLogin: serverTimestamp(),
        role, // Set proper role
        isActive: true,
        preferences: {
          notifications: true,
          theme: 'light',
        },
      };
      
      await setDoc(userRef, userData);
      console.log('✅ New user document created:', user.uid, 'Role:', role);
      return userData;
    } else {
      await setDoc(
        userRef,
        {
          lastLogin: serverTimestamp(),
          displayName: user.displayName,
          photoURL: user.photoURL,
          role, // Update role if changed
        },
        { merge: true }
      );
      
      console.log('✅ User document updated:', user.uid, 'Role:', role);
      return userDoc.data() as UserData;
    }
  } catch (error) {
    console.error('❌ Error creating/updating user document:', error);
    throw error;
  }
};

export const getUserData = async (uid: string): Promise<UserData | null> => {
  try {
    const userRef = doc(db, 'users', uid);
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists()) {
      return userDoc.data() as UserData;
    }
    return null;
  } catch (error) {
    console.error('❌ Error getting user data:', error);
    return null;
  }
};
