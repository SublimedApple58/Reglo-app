'use client';

import { UserRole } from '@/lib/constants';
import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';

const useRequireRole = (role: UserRole) => {
  const { data: session } = useSession();
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    setIsAuthorized(!!session && session.user?.role === role);
  }, [session?.user?.role]);

  return { isAuthorized, role: session?.user?.role ?? UserRole.NO_ROLE };
};

export default useRequireRole;
