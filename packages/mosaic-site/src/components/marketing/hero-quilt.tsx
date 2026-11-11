'use client';

import { HeroGrid } from '@/components/marketing/hero-grid';
import { MosaicGlyph } from '@/components/marketing/mosaic-glyph';
import { MosaicScene } from '@/components/marketing/mosaic-scene';
import { PromptBar } from '@/components/prompt-bar/prompt-bar';
import { AGENT_PROMPT } from '@/lib/agent-prompt';

export function HeroQuilt() {
  return (
    <section className='bg-background text-foreground relative isolate -mt-14 flex min-h-[calc(100svh-8rem)] flex-col items-center justify-center overflow-hidden px-6 pb-16 pt-20 text-center'>
      <HeroGrid />
      <MosaicScene />
      <div
        data-mosaic-focus
        className='size-40 sm:size-52 2xl:size-64'
      />
      <p
        data-hero-eyebrow
        className='tag-1 mb-2 mt-2 inline-flex items-center gap-1.5'
      >
        <span
          aria-hidden='true'
          className='text-gray-400 dark:text-gray-600'
        >
          [
        </span>
        <MosaicGlyph className='text-purple-500 dark:text-purple-400' />
        <span className='text-purple-500 dark:text-purple-400'>Mosaic</span>
        <span
          aria-hidden='true'
          className='text-gray-400 dark:text-gray-600'
        >
          ]
        </span>
      </p>
      <h1 className='heading-3 sm:heading-2 lg:heading-1 mt-2 max-w-3xl text-balance'>
        Production-ready UI your agents can build with
      </h1>
      <p className='body-2 mt-2 max-w-xl text-balance text-neutral-600 dark:text-neutral-400'>
        The agent-native UI kit, powered by Clerk.
      </p>
      <div
        data-hero-end
        className='mt-8 flex w-full max-w-xl justify-center'
      >
        <PromptBar
          command={AGENT_PROMPT}
          align='center'
          tone={{ light: 'gray-50', dark: 'gray-800' }}
        />
      </div>
    </section>
  );
}
