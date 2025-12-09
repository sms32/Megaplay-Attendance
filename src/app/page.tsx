'use client';

import { useAuth } from './context/AuthContext';
import { useRouter } from 'next/navigation';
import { isAdmin } from '@/lib/utils/adminCheck';
import Image from 'next/image';

export default function LandingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const handleMarkAttendance = () => {
    if (loading) return;

    if (user) {
      if (isAdmin(user.email)) {
        router.push('/admin');
      } else {
        router.push('/pollclosed');
      }
    } else {
      router.push('/pollclosed');
    }
  };

  return (
    <div 
      className="min-h-screen relative overflow-hidden"
      style={{ 
        background: '#000000',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
      }}
    >
      {/* Subtle gradient overlay */}
      <div 
        className="absolute inset-0 opacity-40"
        style={{
          background: 'radial-gradient(ellipse at top, rgba(20, 20, 20, 0.8) 0%, transparent 50%), radial-gradient(ellipse at bottom, rgba(10, 10, 10, 0.6) 0%, transparent 50%)'
        }}
      />

      {/* Grid pattern overlay */}
      <div 
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px)`,
          backgroundSize: '50px 50px'
        }}
      />

      {/* Main Content Container */}
      <div className="relative z-10 min-h-screen">
        {/* Desktop Layout */}
        <div className="hidden lg:flex items-center justify-center px-12 xl:px-20 max-w-[1400px] mx-auto min-h-screen py-20">
          <div className="flex flex-col items-center space-y-12 text-center">
            {/* Logo/Icon placeholder - you can replace with your logo */}
            <div className="w-20 h-20 rounded-full flex items-center justify-center"
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(10px)'
              }}
            >
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 17L12 22L22 17" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 12L12 17L22 12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>

            {/* Title */}
            <div className="space-y-4">
              <h1 
                className="text-7xl xl:text-8xl font-semibold tracking-tight"
                style={{ 
                  color: '#ffffff',
                  letterSpacing: '-0.02em',
                  lineHeight: '1'
                }}
              >
                MEGAPLAY
              </h1>
              <h2 
                className="text-3xl xl:text-4xl font-normal"
                style={{ 
                  color: 'rgba(255, 255, 255, 0.6)',
                  letterSpacing: '0.1em',
                  fontWeight: '400'
                }}
              >
                ATTENDANCE
              </h2>
            </div>

            {/* Subtitle */}
            <p 
              className="text-lg xl:text-xl max-w-md"
              style={{ 
                color: 'rgba(255, 255, 255, 0.5)',
                lineHeight: '1.6',
                letterSpacing: '0.01em'
              }}
            >
              Mark your presence for today&apos;s event
            </p>

            {/* Glassmorphic Button */}
            <div className="pt-4">
              <button
                onClick={handleMarkAttendance}
                disabled={loading}
                className="group relative px-8 py-4 rounded-lg overflow-hidden transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  backdropFilter: 'blur(10px)',
                  boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
                }}
                onMouseEnter={(e) => {
                  if (!loading) {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 12px 40px 0 rgba(0, 0, 0, 0.5)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 8px 32px 0 rgba(0, 0, 0, 0.37)';
                }}
              >
                <span 
                  className="relative text-base font-medium flex items-center gap-2"
                  style={{ 
                    color: 'rgba(255, 255, 255, 0.9)',
                    letterSpacing: '0.05em'
                  }}
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Loading...
                    </>
                  ) : (
                    <>
                      Mark Attendance
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </>
                  )}
                </span>
              </button>
            </div>

            {/* Additional info */}
            <div className="pt-8 flex items-center gap-2 text-sm"
              style={{ 
                color: 'rgba(255, 255, 255, 0.4)'
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M8 5V8L10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <span>December 09, 2025</span>
            </div>
          </div>
        </div>

        {/* Mobile/Tablet Layout */}
        <div className="lg:hidden flex flex-col items-center justify-center min-h-screen px-6 py-12 text-center">
          {/* Logo/Icon */}
          <div className="w-16 h-16 rounded-full flex items-center justify-center mb-8"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              backdropFilter: 'blur(10px)'
            }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 17L12 22L22 17" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 12L12 17L22 12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>

          {/* Title */}
          <div className="space-y-3 mb-6">
            <h1 
              className="text-5xl sm:text-6xl font-semibold tracking-tight"
              style={{ 
                color: '#ffffff',
                letterSpacing: '-0.02em',
                lineHeight: '1'
              }}
            >
              MEGAPLAY
            </h1>
            <h2 
              className="text-2xl sm:text-3xl font-normal"
              style={{ 
                color: 'rgba(255, 255, 255, 0.6)',
                letterSpacing: '0.1em',
                fontWeight: '400'
              }}
            >
              ATTENDANCE
            </h2>
          </div>

          {/* Subtitle */}
          <p 
            className="text-base sm:text-lg mb-10 max-w-sm"
            style={{ 
              color: 'rgba(255, 255, 255, 0.5)',
              lineHeight: '1.6'
            }}
          >
            Mark your presence for today&apos;s event
          </p>

          {/* Glassmorphic Button */}
          <button
            onClick={handleMarkAttendance}
            disabled={loading}
            className="relative px-8 py-4 rounded-lg overflow-hidden transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed mb-8"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              backdropFilter: 'blur(10px)',
              boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
            }}
            onTouchStart={(e) => {
              if (!loading) {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
              }
            }}
            onTouchEnd={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
            }}
          >
            <span 
              className="relative text-base font-medium flex items-center gap-2"
              style={{ 
                color: 'rgba(255, 255, 255, 0.9)',
                letterSpacing: '0.05em'
              }}
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Loading...
                </>
              ) : (
                <>
                  Mark Attendance
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </>
              )}
            </span>
          </button>

          {/* Additional info */}
          <div className="flex items-center gap-2 text-sm"
            style={{ 
              color: 'rgba(255, 255, 255, 0.4)'
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M8 5V8L10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <span>December 09, 2025</span>
          </div>
        </div>
      </div>
    </div>
  );
}
