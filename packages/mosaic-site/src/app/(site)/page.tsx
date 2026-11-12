import type { Metadata } from 'next';

import { BakedMosaic, MOSAIC_MASK_URL, MOSAIC_SURFACE_URL } from '@/components/marketing/baked-mosaic';
import { HeroQuilt } from '@/components/marketing/hero-quilt';
import { OverviewSections } from '@/components/marketing/overview';
export const metadata: Metadata = {
  title: 'Clerk UI — Mosaic',
  description:
    'Sign-in, profiles, consent and agent experiences. Composable components made to be rearranged, restyled and replaced.',
};
export default function Page() {
  return (
    <main className='relative isolate overflow-x-clip'>
      <link
        rel='preload'
        as='image'
        href={MOSAIC_MASK_URL}
        fetchPriority='high'
      />
      <link
        rel='preload'
        as='image'
        href={MOSAIC_SURFACE_URL}
      />
      <HeroQuilt scene={<BakedMosaic />} />
      <OverviewSections />
    </main>
  );
}
