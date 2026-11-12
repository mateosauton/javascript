import { FeatureTabs } from '@/components/marketing/feature-tabs';
import { Container } from '@/components/ui/container';

export function OverviewSections() {
  return (
    <section
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
