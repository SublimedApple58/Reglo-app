'use client';

import { useEffect, useState } from 'react';
import { getCurrentCompany } from '@/lib/actions/company.actions';

type CompanyRole = 'admin' | 'member';

const useRequireRole = (role: CompanyRole) => {
  const [companyRole, setCompanyRole] = useState<CompanyRole | null>(null);
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const loadRole = async () => {
      const res = await getCurrentCompany();
      if (!res.success || !res.data || !isMounted) return;
      const normalizedRole = res.data.role === 'admin' ? 'admin' : 'member';
      setCompanyRole(normalizedRole);
    };

    loadRole();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!companyRole) return;
    setIsAuthorized(companyRole === role);
  }, [companyRole, role]);

  return { isAuthorized, role: companyRole };
};

export default useRequireRole;
