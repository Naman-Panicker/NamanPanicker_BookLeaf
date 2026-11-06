'use client';

import type { Role, SessionUser } from '@bookleaf/shared';
import Link from 'next/link';
import { notFound, usePathname } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { BookLeafLogo } from '@/components/bookleaf-logo';
import { Button } from '@/components/ui/button';
import { Loading } from '@/components/ui/spinner';
import { getCurrentUser, logOut, SIGN_IN_PATH } from '@/lib/api';
import { homePath } from '@/lib/home-path';

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
          aria-current={pathname.startsWith(href) ? 'page' : undefined}
          className={pathname.startsWith(href) ? 'font-bold text-link' : 'text-muted-foreground hover:text-foreground'}
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
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    getCurrentUser().then(setUser, () => setLoadFailed(true));
  }, []);

  if (loadFailed) {
    return <p className="p-6 text-sm text-destructive">Could not load your account. Please reload the page.</p>;
  }
  if (!user) {
    return <Loading className="p-6" />;
  }
  if (user.role !== role) notFound();

  async function signOut() {
    setSigningOut(true);
    try {
      await logOut();
      window.location.assign(SIGN_IN_PATH);
    } catch (failure) {
      setSigningOut(false);
      throw failure;
    }
  }

  return (
    <div className="min-h-svh">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:bg-background focus:px-3 focus:py-2 focus:text-sm"
      >
        Skip to content
      </a>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3">
        <div className="flex items-center gap-6">
          <Link href={homePath(role)}>
            <BookLeafLogo className="h-9 w-auto" />
          </Link>
          {role === 'AUTHOR' && <AuthorNav />}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{user.name}</span>
          <Button variant="outline" size="sm" pending={signingOut} onClick={signOut}>
            Sign out
          </Button>
        </div>
      </header>
      <main id="main-content" className="p-6">
        {children}
      </main>
    </div>
  );
}
