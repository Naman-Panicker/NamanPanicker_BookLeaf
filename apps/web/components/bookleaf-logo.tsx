import Image from 'next/image';

// A JPEG on white, taken from bookleafpub.in, so it only sits on white surfaces.
export function BookLeafLogo({ className }: { className?: string }) {
  return <Image src="/bookleaf-logo.jpg" alt="BookLeaf Publishing" width={630} height={195} priority className={className} />;
}
