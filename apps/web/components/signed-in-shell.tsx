'use client';

import type { Role, SessionUser } from '@bookleaf/shared';
import Link from 'next/link';
import { notFound, usePathname } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { getCurrentUser, logOut, SIGN_IN_PATH } from '@/lib/api';

type Props = {
  role: Role;
  children: ReactNode;
};

const AUTHOR_LINKS = [
  { href: '/books', label: 'My Books' },
  { href: '/tickets', label: 'My Tickets' },
];

function AuthorNav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-4 text-sm">
      {AUTHOR_LINKS.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          className={pathname.startsWith(href) ? 'font-medium' : 'text-muted-foreground hover:text-foreground'}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

// The frame around every signed-in page. Being logged out sends the browser to sign-in,
// and the wrong role sees the 404 page, so these pages look like they don't exist.
export function SignedInShell({ role, children }: Props) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    getCurrentUser().then(setUser, () => setLoadFailed(true));
  }, []);

  if (loadFailed) {
    return <p className="p-6 text-sm text-destructive">Could not load your account. Please reload the page.</p>;
  }
  if (!user) {
    return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  }
  if (user.role !== role) notFound();

  async function signOut() {
    await logOut();
    window.location.assign(SIGN_IN_PATH);
  }

  return (
    <div className="min-h-svh">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3">
        <div className="flex items-center gap-6">
          <span className="font-medium">BookLeaf</span>
          {role === 'AUTHOR' && <AuthorNav />}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{user.name}</span>
          <Button variant="outline" size="sm" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
