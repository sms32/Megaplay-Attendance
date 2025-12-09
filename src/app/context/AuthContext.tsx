'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { 
  User, 
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged
} from 'firebase/auth';
import { auth, googleProvider } from '../../lib/firebase/config';
import { isKarunyaEmail } from '../../lib/validators/emailValidator';
import { createOrUpdateUserDocument, UserData } from '../../lib/services/userService';

interface AuthContextType {
  user: User | null;
  userData: UserData | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      console.log('Auth state changed:', user?.email);
      
      if (user && user.email) {
        if (!isKarunyaEmail(user.email)) {
          console.log('Invalid email domain, signing out');
          await firebaseSignOut(auth);
          setUser(null);
          setUserData(null);
        } else {
          console.log('Valid user, setting state');
          setUser(user);
          
          // Create or update user document in Firestore
          try {
            const firestoreUserData = await createOrUpdateUserDocument(user);
            setUserData(firestoreUserData);
            console.log('User data synced with Firestore');
          } catch (error) {
            console.error('Failed to sync user data:', error);
          }
        }
      } else {
        setUser(null);
        setUserData(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      console.log('Sign in popup completed:', result.user.email);
      
      if (!result.user.email || !isKarunyaEmail(result.user.email)) {
        await firebaseSignOut(auth);
        throw new Error('Only @karunya.edu or @karunya.edu.in emails are allowed');
      }
      
      // onAuthStateChanged will handle creating the user document
    } catch (error: any) {
      console.error('Error signing in with Google:', error);
      
      if (error.code === 'auth/popup-closed-by-user') {
        throw new Error('Sign-in popup was closed. Please try again.');
      } else if (error.code === 'auth/cancelled-popup-request') {
        throw new Error('Another sign-in popup is already open.');
      } else if (error.code === 'auth/popup-blocked') {
        throw new Error('Sign-in popup was blocked by your browser. Please allow popups for this site.');
      }
      
      throw error;
    }
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
      setUserData(null);
      console.log('User signed out successfully');
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  };

  const value = {
    user,
    userData,
    loading,
    signInWithGoogle,
    signOut
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
