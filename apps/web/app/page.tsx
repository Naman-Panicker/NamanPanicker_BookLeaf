'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { findCurrentUser, SIGN_IN_PATH } from '@/lib/api';
import { homePath } from '@/lib/home-path';

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    findCurrentUser().then(
      (user) => router.replace(user ? homePath(user.role) : SIGN_IN_PATH),
      () => router.replace(SIGN_IN_PATH),
    );
  }, [router]);

  return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
}
