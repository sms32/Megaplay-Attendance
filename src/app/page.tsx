'use client';

import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useRouter } from 'next/navigation';
import { isAdmin } from '@/lib/utils/adminCheck';
import Image from 'next/image';

// Animated Blobs Component (Enhanced)
function AnimatedBlobs() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Primary blob - Enhanced */}
      <div
        className="absolute top-1/4 left-1/4 w-[520px] h-[520px] rounded-[60%] opacity-40"
        style={{
          background:
            'radial-gradient(circle at 30% 30%, hsl(220, 80%, 45%) 0%, hsl(220, 70%, 35%) 40%, transparent 70%)',
          filter: 'blur(100px)',
          animation: 'blob1 22s ease-in-out infinite',
        }}
      />
      {/* Secondary blob */}
      <div
        className="absolute bottom-1/4 right-1/4 w-[430px] h-[430px] rounded-[70%] opacity-35"
        style={{
          background:
            'radial-gradient(circle at 70% 70%, hsl(280, 75%, 50%) 0%, hsl(280, 65%, 40%) 50%, transparent 70%)',
          filter: 'blur(90px)',
          animation: 'blob2 28s ease-in-out infinite reverse',
        }}
      />
      {/* Tertiary blob - More prominent */}
      <div
        className="absolute top-1/3 right-1/3 w-[620px] h-[620px] rounded-[50%] opacity-30"
        style={{
          background:
            'radial-gradient(circle, hsl(200, 85%, 40%) 0%, hsl(200, 70%, 30%) 50%, transparent 75%)',
          filter: 'blur(120px)',
          animation: 'blob3 35s ease-in-out infinite',
        }}
      />

      <style jsx>{`
        @keyframes blob1 {
          0%,
          100% {
            transform: translate(0, 0) scale(1) rotate(0deg);
          }
          33% {
            transform: translate(40px, -60px) scale(1.15) rotate(120deg);
          }
          66% {
            transform: translate(-30px, 30px) scale(0.9) rotate(240deg);
          }
        }
        @keyframes blob2 {
          0%,
          100% {
            transform: translate(0, 0) scale(1) rotate(0deg);
          }
          33% {
            transform: translate(-40px, 40px) scale(1.2) rotate(-120deg);
          }
          66% {
            transform: translate(50px, -30px) scale(0.85) rotate(-240deg);
          }
        }
        @keyframes blob3 {
          0%,
          100% {
            transform: translate(0, 0) scale(1) rotate(0deg);
          }
          50% {
            transform: translate(-20px, 20px) scale(1.15) rotate(180deg);
          }
        }
      `}</style>
    </div>
  );
}

// Enhanced Glass Button
function GlassButton({
  children,
  onClick,
  isLoading = false,
  disabled = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  isLoading?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={isLoading || disabled}
      className="group relative px-9 py-4 rounded-3xl overflow-hidden transition-all duration-500 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
      style={{
        background: 'rgba(255, 255, 255, 0.08)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        backdropFilter: 'blur(25px)',
        boxShadow:
          '0 12px 32px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
      }}
      onMouseEnter={(e) => {
        if (!isLoading && !disabled) {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
          e.currentTarget.style.transform = 'translateY(-4px) scale(1.02)';
          e.currentTarget.style.boxShadow =
            '0 18px 50px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.25)';
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
        e.currentTarget.style.transform = 'translateY(0) scale(1)';
        e.currentTarget.style.boxShadow =
          '0 12px 32px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.2)';
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-white/10 via-transparent to-white/10 -skew-x-12 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      <span className="relative text-[15px] sm:text-[16px] font-semibold flex items-center gap-3 text-white tracking-wide">
        {isLoading ? (
          <>
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Processing...
          </>
        ) : (
          children
        )}
      </span>
    </button>
  );
}

function ArrowIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 3L11 8L6 13" />
    </svg>
  );
}

export default function LandingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [isProcessing, setIsProcessing] = useState(false);

  const handleMarkAttendance = () => {
    if (loading || isProcessing) return;

    setIsProcessing(true);

    setTimeout(() => {
      if (user) {
        if (isAdmin(user.email)) {
          router.push('/admin');
        } else {
          router.push('/coordinator');
        }
      } else {
        router.push('/login');
      }
      setIsProcessing(false);
    }, 800);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-slate-900/50 to-black/80 relative overflow-hidden">
      {/* Enhanced gradient overlay */}
      <div
        className="absolute inset-0 opacity-50 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 20% 20%, rgba(59, 130, 246, 0.1) 0%, transparent 50%), radial-gradient(ellipse 60% 40% at 80% 80%, rgba(168, 85, 247, 0.1) 0%, transparent 50%), radial-gradient(ellipse at center, rgba(20, 20, 20, 0.9) 0%, transparent 70%)',
        }}
      />

      {/* Enhanced grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.08) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      <AnimatedBlobs />

      {/* Main Content */}
      <div className="relative z-10 min-h-screen flex items-center justify-center px-4 sm:px-6 py-14 lg:py-20">
        <div className="flex flex-col items-center text-center max-w-xl">
          {/* Slightly smaller logo */}
          <div
            className="w-24 h-24 lg:w-28 lg:h-28 rounded-3xl flex items-center justify-center mb-10 lg:mb-14 animate-[fadeInUp_0.8s_ease-out_forwards]"
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              backdropFilter: 'blur(30px)',
              boxShadow:
                '0 14px 50px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
              opacity: 0,
              transform: 'translateY(30px)',
            }}
          >
            <Image
              src="/klo2.svg"
              alt="MegaPlay"
              width={46}
              height={46}
              className="w-16 h-16 lg:w-20 lg:h-20 object-contain drop-shadow-2xl"
              priority
            />
          </div>

          {/* Slightly reduced Title Section */}
          <div className="space-y-3 lg:space-y-4 mb-7 lg:mb-8">
            <h1
              className="bg-gradient-to-r from-white via-white/90 to-gray-100 bg-clip-text text-transparent text-[40px] sm:text-[52px] lg:text-[64px] xl:text-[72px] font-bold tracking-[-0.05em] animate-[fadeInUp_0.8s_ease-out_0.1s_forwards]"
              style={{ lineHeight: 1, opacity: 0, transform: 'translateY(30px)' }}
            >
              MEGAPLAY
            </h1>
            <h2
              className="text-xl sm:text-2xl lg:text-3xl font-light tracking-[0.3em] text-white/70 animate-[fadeInUp_0.8s_ease-out_0.2s_forwards] uppercase"
              style={{ opacity: 0, transform: 'translateY(30px)' }}
            >
              ATTENDANCE
            </h2>
          </div>

          {/* Subtitle */}
          <p
            className="text-lg sm:text-xl lg:text-2xl text-white/60 mb-10 lg:mb-12 max-w-md leading-relaxed animate-[fadeInUp_0.8s_ease-out_0.3s_forwards]"
            style={{ opacity: 0, transform: 'translateY(30px)' }}
          >
            {user
              ? `Welcome back, ${(user.email ?? '').split('@')[0] || 'User'}`
              : 'Karunya University '}
          </p>

          {/* CTA */}
          <div
            className="animate-[fadeInUp_0.8s_ease-out_0.4s_forwards]"
            style={{ opacity: 0, transform: 'translateY(30px)' }}
          >
            <GlassButton
              onClick={handleMarkAttendance}
              isLoading={isProcessing || loading}
              disabled={loading}
            >
              {user ? 'Continue to Dashboard' : 'Mark Attendance'}
              <ArrowIcon className="transition-all duration-500 group-hover:translate-x-2 group-hover:scale-110" />
            </GlassButton>
          </div>

          {/* Auth Status Indicator */}
          {user && (
            <div
              className="mt-6 animate-[fadeInUp_0.8s_ease-out_0.5s_forwards]"
              style={{ opacity: 0, transform: 'translateY(20px)' }}
            >
              <div className="flex items-center gap-2 text-xs sm:text-sm text-emerald-400/80 bg-emerald-500/10 px-3 py-1.5 rounded-2xl backdrop-blur-sm border border-emerald-500/20">
                <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                {isAdmin(user.email) ? 'Admin' : 'Coordinator'} • Ready
              </div>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(40px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
