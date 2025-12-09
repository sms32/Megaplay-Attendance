// lib/hooks/useCoordinatorCheck.ts
import { useEffect, useState } from 'react';
import { useAuth } from '@/app/context/AuthContext';
import { isCoordinatorEmail } from '@/lib/services/coordinatorService';
import { useRouter } from 'next/navigation';

export const useCoordinatorCheck = () => {
  const { user, loading } = useAuth();
  const [isCoordinator, setIsCoordinator] = useState<boolean | null>(null);
  const router = useRouter();

  useEffect(() => {
    const checkCoordinator = async () => {
      if (loading || !user?.email) {
        setIsCoordinator(null);
        return;
      }

      try {
        const allowed = await isCoordinatorEmail(user.email);
        setIsCoordinator(allowed);
        
        if (!allowed) {
          router.replace('/login');
        }
      } catch (error) {
        console.error('Coordinator check failed:', error);
        setIsCoordinator(false);
        router.replace('/login');
      }
    };

    checkCoordinator();
  }, [user, loading, router]);

  return { isCoordinator, loading: loading || isCoordinator === null };
};
