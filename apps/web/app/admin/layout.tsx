import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { SignedInShell } from '@/components/signed-in-shell';

export const metadata: Metadata = { title: { default: 'Ticket queue', template: '%s · BookLeaf Author Support' } };

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <SignedInShell role="ADMIN">{children}</SignedInShell>;
}
