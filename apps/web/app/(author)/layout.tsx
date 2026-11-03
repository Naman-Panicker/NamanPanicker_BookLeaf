import type { ReactNode } from 'react';
import { SignedInShell } from '@/components/signed-in-shell';

export default function AuthorLayout({ children }: { children: ReactNode }) {
  return <SignedInShell role="AUTHOR">{children}</SignedInShell>;
}
