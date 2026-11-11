'use client';

import { useLayoutEffect, useRef } from 'react';

import { FeatureTabs } from '@/components/marketing/feature-tabs';
import { Container } from '@/components/ui/container';

const HERO_GAP = 112;

export function OverviewSections() {
  const ref = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    const heroEnd = document.querySelector('[data-hero-end]');
    if (!element || !heroEnd) {
      return;
    }
    const update = () => {
      element.style.marginTop = '0px';
      const gap = element.getBoundingClientRect().top - heroEnd.getBoundingClientRect().bottom;
      element.style.marginTop = `${HERO_GAP - gap}px`;
    };
    update();
    void document.fonts.ready.then(update);
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return (
    <section
      ref={ref}
      aria-labelledby='overview-principles-heading'
      className='relative z-10'
    >
      <Container className='relative pb-40'>
        <h2
          id='overview-principles-heading'
          className='heading-4 sm:heading-3 max-w-2xl text-balance text-gray-950 dark:text-white'
        >
          Built for agents,
          <br />
          ready for production
        </h2>
        <FeatureTabs />
      </Container>
    </section>
  );
}
