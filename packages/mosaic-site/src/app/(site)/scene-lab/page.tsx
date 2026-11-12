import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { HeroQuilt } from '@/components/marketing/hero-quilt';
import { MosaicScene } from '@/components/marketing/mosaic-scene';

export const metadata: Metadata = { title: 'Scene lab — Mosaic' };

export default function Page() {
  if (process.env.NODE_ENV !== 'development') {
    notFound();
  }
  return (
    <main className='relative isolate overflow-x-clip'>
      <HeroQuilt scene={<MosaicScene />} />
    </main>
  );
}
