'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useRouter } from 'next/navigation';
import { isAdmin } from '@/lib/utils/adminCheck';
import { isCoordinatorEmail } from '@/lib/services/coordinatorService';

export default function LoginPage() {
  const [error, setError] = useState('');
  const [isSigningIn, setIsSigningIn] = useState(false);
  const { user, loading, signInWithGoogle, signOut } = useAuth();
  const router = useRouter();

  // Redirect when user is authenticated
  useEffect(() => {
    const run = async () => {
      console.log('Login page - user:', user, 'loading:', loading);

      if (!loading && user && user.email) {
        try {
          // Check whitelist
          const allowed = await isCoordinatorEmail(user.email);
          if (!allowed) {
            setError('Your email is not authorized for this system. Please contact the admin.');
            await signOut();
            return;
          }

          // Admin vs coordinator redirect
          if (isAdmin(user.email)) {
            console.log('Admin detected, redirecting to /admin');
            router.push('/admin');
          } else {
            console.log('Coordinator detected, redirecting to /coordinator');
            router.push('/coordinator');
          }
        } catch (e) {
          console.error('Error checking coordinator access:', e);
          setError('Failed to verify access. Please try again.');
        }
      }
    };

    run();
  }, [user, loading, router, signOut]);

  const handleGoogleSignIn = async () => {
    if (isSigningIn) return;

    setError('');
    setIsSigningIn(true);

    try {
      await signInWithGoogle();
      console.log('Sign in initiated');
      // useEffect will handle redirect when user state updates
    } catch (err: unknown) {
      console.error('Sign in error:', err);
      const message = err instanceof Error ? err.message : String(err);
      setError(
        message ||
          'Failed to sign in with Google. Please ensure you are using a @karunya.edu / @karunya.edu.in / KATE email.',
      );
      setIsSigningIn(false);
    }
  };

  // Show loading while checking auth state
  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{
          background:
            'linear-gradient(135deg, #021210 0%, #031815 20%, #041d1a 40%, #05221f 60%, #062724 80%, #021210 100%)',
          fontFamily: '"Georgia Pro", Georgia, "Times New Roman", serif',
        }}
      >
        <div className="text-center">
          <div
            className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto"
            style={{ borderColor: '#D4AF37' }}
          ></div>
          <p className="mt-4 text-gray-300">Loading...</p>
        </div>
      </div>
    );
  }

  // Don't show login form if already logged in (brief message while redirecting)
  if (user) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{
          background:
            'linear-gradient(135deg, #021210 0%, #031815 20%, #041d1a 40%, #05221f 60%, #062724 80%, #021210 100%)',
          fontFamily: '"Georgia Pro", Georgia, "Times New Roman", serif',
        }}
      >
        <div className="text-center">
          <div
            className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto"
            style={{ borderColor: '#D4AF37' }}
          ></div>
          <p className="mt-4 text-gray-300">
            {isAdmin(user.email) ? 'Redirecting to admin panel...' : 'Redirecting to coordinator page...'}
          </p>
        </div>
      </div>
    );
  }

  // Your existing UI unchanged below
  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background:
          'linear-gradient(135deg, #021210 0%, #031815 20%, #041d1a 40%, #05221f 60%, #062724 80%, #021210 100%)',
        fontFamily: '"Georgia Pro", Georgia, "Times New Roman", serif',
      }}
    >
      <div
        className="absolute inset-0 opacity-40"
        style={{
          background:
            'radial-gradient(ellipse at top right, rgba(6, 39, 36, 0.5) 0%, transparent 50%), radial-gradient(ellipse at bottom left, rgba(2, 18, 16, 0.6) 0%, transparent 50%)',
        }}
      />
      <div
        className="max-w-md w-full space-y-8 p-10 rounded-2xl shadow-2xl relative z-10"
        style={{
          background: 'rgba(4, 29, 26, 0.9)',
          border: '1px solid rgba(212, 175, 55, 0.2)',
          backdropFilter: 'blur(10px)',
        }}
      >
        {/* header + copy same as your current code */}

        {error && (
          <div
            className="p-4 rounded-lg text-sm flex items-start gap-2"
            style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#FCA5A5',
            }}
          >
            <svg
              className="w-5 h-5 flex-shrink-0 mt-0.5"
              fill="currentColor"
              viewBox="0 0 20 20"
              style={{ color: '#EF4444' }}
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
            <span>{error}</span>
          </div>
        )}

        <button
          onClick={handleGoogleSignIn}
          disabled={isSigningIn}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-lg shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          style={{
            background: 'rgba(255, 255, 255, 0.95)',
            border: '1px solid rgba(212, 175, 55, 0.3)',
            cursor: isSigningIn ? 'not-allowed' : 'pointer',
            boxShadow: '0 4px 15px rgba(0, 0, 0, 0.3)',
            transition: 'all 0.3s ease',
          }}
        >
          {/* same Google button content as before */}
        </button>
      </div>
    </div>
  );
}
