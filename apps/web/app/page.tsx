import Link from 'next/link';

export default function HomePage() {
  return (
    <main>
      <h1>BookLeaf Author Support</h1>
      <p>
        <Link href="/spike">Deploy spike checks</Link>
      </p>
    </main>
  );
}
