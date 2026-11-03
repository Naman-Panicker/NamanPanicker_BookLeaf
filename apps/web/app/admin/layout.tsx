import type { ReactNode } from 'react';
import { SignedInShell } from '@/components/signed-in-shell';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <SignedInShell role="ADMIN">{children}</SignedInShell>;
}
