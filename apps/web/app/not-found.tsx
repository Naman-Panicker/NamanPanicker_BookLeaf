import Link from 'next/link';

export default function NotFoundPage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-2 p-6 text-center">
      <h1>Page not found</h1>
      <p className="text-sm text-muted-foreground">This page doesn&apos;t exist, or you don&apos;t have access to it.</p>
      <Link href="/" className="text-sm text-link underline underline-offset-4">
        Back to BookLeaf
      </Link>
    </main>
  );
}
