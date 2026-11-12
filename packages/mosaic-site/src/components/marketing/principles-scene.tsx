'use client';

import { Panel } from '@clerk/mosaic/components/panel';
import { Radio } from '@clerk/mosaic/components/radio';
import { UserProfileView } from '@clerk/mosaic/features/user-profile/user-profile.view';
import { UserProfileConnectedAccountsSectionView } from '@clerk/mosaic/features/user-profile/user-profile-connected-accounts-section/user-profile-connected-accounts-section.view';
import { UserProfileEmailSectionView } from '@clerk/mosaic/features/user-profile/user-profile-email-section/user-profile-email-section.view';
import { UserProfilePhoneSectionView } from '@clerk/mosaic/features/user-profile/user-profile-phone-section/user-profile-phone-section.view';
import { UserProfileProfileSectionView } from '@clerk/mosaic/features/user-profile/user-profile-profile-section/user-profile-profile-section.view';
import { PortalProvider } from '@clerk/mosaic/primitives/portal';
import { useUserProfileFixture } from '@swingset/stories/fixtures/user-profile';
import { useConnectedAccountsFixture } from '@swingset/stories/fixtures/user-profile-connected-accounts';
import { useUserProfileEmailsFixture } from '@swingset/stories/fixtures/user-profile-emails';
import { useUserProfilePhonesFixture } from '@swingset/stories/fixtures/user-profile-phones';
import { useUserProfileProfileFixture } from '@swingset/stories/fixtures/user-profile-profile';
import clsx from 'clsx';
import { Reorder, spring, useDragControls } from 'motion/react';
import * as React from 'react';

import { XrayOverlay } from '@/components/gallery/xray';
import { withoutUserComingSoon } from '@/lib/components/pages';
import { SCENE_THEME_CSS, SCENE_THEMES, type SceneThemeChoice } from '@/lib/components/scene-themes';

export type SceneId = 'composable' | 'agent' | 'theme' | 'clerk';

type SectionId = 'profile' | 'email' | 'phone' | 'connected';

const FOLDERS: Record<SectionId, string> = {
  profile: 'profile-section',
  email: 'email-section',
  phone: 'phone-section',
  connected: 'connected-accounts-section',
};

const FILES = ['model.ts', 'controller.ts', 'view.tsx'];

const MOVE = String(spring(0.5, 0.12));
const FADE = String(spring(0.3, 0));

const RENDER_W = 1200;
const SCALE = 0.75;

const RIM_TOP_DARK = 'oklch(0.97 0.006 84 / 0.12)';
const RIM_BOTTOM_DARK = 'oklch(0.97 0.006 84 / 0.04)';
const INSET_DARK = 'inset 0 1px 0 0 oklch(0.97 0.006 84 / 0.06)';
const SHADOW_DARK =
  'calc(var(--shadow-x, 0px) * 0.5) 1px 1px oklch(0.05 0.02 275 / 0.35), var(--shadow-x, 0px) 2px 2px -1px oklch(0.08 0.02 278 / 0.3), calc(var(--shadow-x, 0px) * 2) 4px 6px -3px oklch(0.1 0.015 282 / 0.35)';
const RIM = `
  --rim-top: light-dark(oklch(0.25 0.007 65 / 0.05), ${RIM_TOP_DARK});
  --rim-bottom: light-dark(oklch(0.25 0.007 65 / 0.12), ${RIM_BOTTOM_DARK});
  --rim-fill: var(--cl-color-page, #fff);
  border: var(--rim-width, 1px) solid transparent !important;
  background: linear-gradient(var(--rim-fill), var(--rim-fill)) padding-box,
    linear-gradient(var(--light-angle, 180deg), var(--rim-top), var(--rim-bottom)) border-box !important;
  box-shadow: inset 0 var(--rim-width, 1px) 0 0 light-dark(transparent, oklch(0.97 0.006 84 / 0.06)),
    calc(var(--shadow-x, 0px) * 0.5) 1px 1px light-dark(oklch(0.25 0.04 280 / 0.08), oklch(0.05 0.02 275 / 0.35)),
    var(--shadow-x, 0px) 2px 2px -1px light-dark(oklch(0.35 0.035 285 / 0.06), oklch(0.08 0.02 278 / 0.3)),
    calc(var(--shadow-x, 0px) * 2) 4px 6px -3px light-dark(oklch(0.45 0.03 290 / 0.08), oklch(0.1 0.015 282 / 0.35)) !important;
`;
const RIM_CSS = `
.scene-rim {${RIM}}
.scene-rim-right {
  --light-angle: 160deg;
  --shadow-x: 1px;
}
.scene-rim-dark {
  --rim-top: ${RIM_TOP_DARK};
  --rim-bottom: ${RIM_BOTTOM_DARK};
  --rim-fill: #181613;
  box-shadow: ${INSET_DARK}, ${SHADOW_DARK} !important;
}
[data-scene-rim] .cl-profile-layout {${RIM}  --rim-width: calc(1px / ${SCALE});
}
`;
const CARD_W = RENDER_W * SCALE;
const GUTTER = 24;

function Grip({ controls }: { controls: ReturnType<typeof useDragControls> }) {
  return (
    <button
      type='button'
      aria-label='Drag to reorder'
      onPointerDown={event => controls.start(event)}
      className='absolute -left-9 top-0 grid size-7 cursor-grab touch-none place-items-center rounded-md text-gray-500 hover:bg-gray-200 hover:text-gray-950 active:cursor-grabbing dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white'
    >
      <svg
        viewBox='0 0 16 16'
        className='size-4'
        fill='currentColor'
        aria-hidden='true'
      >
        {[4, 8, 12].flatMap(y =>
          [6, 10].map(x => (
            <circle
              key={`${x}-${y}`}
              cx={x}
              cy={y}
              r={1.25}
            />
          )),
        )}
      </svg>
    </button>
  );
}

function SectionItem({
  id,
  draggable,
  highlighted,
  children,
}: {
  id: SectionId;
  draggable: boolean;
  highlighted: boolean;
  children: React.ReactNode;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={id}
      dragListener={false}
      dragControls={controls}
      data-section={id}
      className={clsx(
        'relative rounded-lg outline outline-2 outline-offset-8 transition-[outline-color]',
        highlighted ? 'outline-purple-500' : 'outline-transparent',
      )}
      whileDrag={{ scale: 1.02, zIndex: 10 }}
    >
      <div
        className='transition-opacity'
        style={{ opacity: draggable ? 1 : 0, transition: `opacity ${FADE}` }}
        {...(draggable ? {} : { inert: true })}
      >
        <Grip controls={controls} />
      </div>
      {children}
    </Reorder.Item>
  );
}

function FileTree({ selected, onSelect }: { selected: SectionId; onSelect: (id: SectionId) => void }) {
  return (
    <div className='scene-rim scene-rim-dark scene-rim-right w-64 overflow-hidden rounded-xl font-mono text-[12px] leading-5 text-[#9a9793]'>
      <div className='flex items-center gap-1.5 border-b border-white/[0.06] px-3.5 py-2.5'>
        {[0, 1, 2].map(dot => (
          <span
            key={dot}
            className='size-2 rounded-full bg-white/15'
          />
        ))}
        <span className='ml-2 text-[#71717a]'>user-profile/</span>
      </div>
      <ul className='p-1.5'>
        {(Object.keys(FOLDERS) as SectionId[]).map(id => {
          const open = id === selected;
          return (
            <li key={id}>
              <button
                type='button'
                aria-expanded={open}
                onClick={() => onSelect(id)}
                onPointerEnter={() => onSelect(id)}
                onFocus={() => onSelect(id)}
                className={clsx(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1 text-left',
                  open ? 'bg-white/[0.07] text-white' : 'hover:text-white',
                )}
              >
                <span
                  aria-hidden='true'
                  className='w-2.5 text-[#71717a]'
                >
                  {open ? '▾' : '▸'}
                </span>
                <span className='truncate'>{FOLDERS[id]}</span>
              </button>
              {open && (
                <ul className='py-0.5 pl-[1.375rem]'>
                  {FILES.map(file => (
                    <li
                      key={file}
                      className='flex items-center gap-2 px-2 py-1'
                    >
                      <span className={clsx('size-1.5 rounded-full', FILE_DOTS[file])} />
                      <span className='text-[#f6f5f4]'>{file}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const FILE_DOTS: Record<string, string> = {
  'model.ts': 'bg-sky-400',
  'controller.ts': 'bg-amber-400',
  'view.tsx': 'bg-violet-400',
};

const THEME_CHOICES: { id: ThemeChoice; label: string; description: string }[] = [
  { id: 'default', label: 'Default', description: 'Mosaic as it ships' },
  ...SCENE_THEMES,
];

function ThemePicker({ value, onChange }: { value: ThemeChoice; onChange: (value: ThemeChoice) => void }) {
  return (
    <div className='scene-rim scene-rim-right w-48 rounded-xl p-2'>
      <Radio.Group<ThemeChoice>
        aria-label='Theme'
        value={value}
        onValueChange={onChange}
      >
        {THEME_CHOICES.map(choice => (
          <Radio.Card
            key={choice.id}
            value={choice.id}
          >
            <Radio.Content>
              <Radio.Label>{choice.label}</Radio.Label>
            </Radio.Content>
          </Radio.Card>
        ))}
      </Radio.Group>
    </div>
  );
}

type ThemeChoice = SceneThemeChoice;

export function PrinciplesScene({ scene }: { scene: SceneId }) {
  const fixture = useUserProfileFixture();
  const profile = useUserProfileProfileFixture();
  const emails = useUserProfileEmailsFixture();
  const phones = useUserProfilePhonesFixture();
  const connections = useConnectedAccountsFixture();
  const [order, setOrder] = React.useState<SectionId[]>(['profile', 'email', 'phone', 'connected']);
  const [selected, setSelected] = React.useState<SectionId>('email');
  const [theme, setTheme] = React.useState<ThemeChoice>('default');
  const [enteredScene, setEnteredScene] = React.useState(scene);
  if (scene !== enteredScene) {
    setEnteredScene(scene);
    if (scene === 'theme') {
      setTheme('default');
    }
  }
  const appliedTheme: ThemeChoice = scene === 'theme' ? theme : 'default';
  const [surface, setSurface] = React.useState<HTMLDivElement | null>(null);
  const portalRef = React.useRef<HTMLDivElement>(null);

  const surfaceRef = React.useRef<HTMLDivElement | null>(null);
  const attachSurface = React.useCallback((element: HTMLDivElement | null) => {
    surfaceRef.current = element;
    setSurface(element);
  }, []);

  const freezeTransitions = React.useCallback(() => {
    const element = surfaceRef.current;
    if (!element) {
      return () => {};
    }
    element.dataset.themeSwitching = '';
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => delete element.dataset.themeSwitching);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  React.useLayoutEffect(() => freezeTransitions(), [appliedTheme, freezeTransitions]);

  React.useEffect(() => {
    const observer = new MutationObserver(() => freezeTransitions());
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
    return () => observer.disconnect();
  }, [freezeTransitions]);

  const sections: Record<SectionId, React.ReactNode> = {
    profile: <UserProfileProfileSectionView {...profile} />,
    email: <UserProfileEmailSectionView {...emails} />,
    phone: <UserProfilePhoneSectionView {...phones} />,
    connected: <UserProfileConnectedAccountsSectionView {...connections} />,
  };

  const account = (
    <Panel.Root>
      <Panel.Title>Account</Panel.Title>
      <Panel.Sections
        render={
          <Reorder.Group
            axis='y'
            values={order}
            onReorder={setOrder}
          />
        }
      >
        {order.map(id => (
          <SectionItem
            key={id}
            id={id}
            draggable={scene === 'composable'}
            highlighted={scene === 'agent' && selected === id}
          >
            {sections[id]}
          </SectionItem>
        ))}
      </Panel.Sections>
    </Panel.Root>
  );

  const centered = scene === 'composable' || scene === 'clerk';
  const satellite = (id: SceneId) => ({
    opacity: scene === id ? 1 : 0,
    translate: scene === id ? '0 0' : '0 12px',
    transition: `opacity ${FADE}, translate ${MOVE}`,
  });

  return (
    <div
      ref={portalRef}
      className='absolute inset-x-0 -top-16 bottom-0 overflow-hidden rounded-b-md'
    >
      <style>{`${SCENE_THEME_CSS}${RIM_CSS}[data-theme-switching], [data-theme-switching] * { transition: none !important; }`}</style>
      <PortalProvider container={portalRef}>
        <div
          className='absolute bottom-0 top-2 [mask-image:linear-gradient(to_bottom,black_calc(100%-6rem),transparent)]'
          style={{
            left: centered ? `calc(50% - ${CARD_W / 2}px)` : GUTTER,
            width: CARD_W,
            transition: `left ${MOVE}`,
          }}
        >
          <div
            ref={attachSurface}
            data-scene-rim=''
            data-theme-switching=''
            data-scene-theme={appliedTheme}
            className='origin-top-left [&_.cl-profile-layout]:!h-[60rem]'
            style={{ width: RENDER_W, scale: SCALE }}
          >
            <UserProfileView
              activePage={fixture.activePage}
              pages={{ ...withoutUserComingSoon(fixture.pages), account }}
              onPageChange={fixture.setActivePage}
            />
          </div>
          <XrayOverlay
            target={surface}
            active={scene === 'clerk'}
          />
        </div>

        <div
          className='absolute top-44 flex flex-col items-end'
          style={{ right: GUTTER }}
        >
          <div
            style={satellite('agent')}
            {...(scene === 'agent' ? {} : { inert: true })}
          >
            <FileTree
              selected={selected}
              onSelect={setSelected}
            />
          </div>
          <div
            className='absolute right-0 top-0'
            style={satellite('theme')}
            {...(scene === 'theme' ? {} : { inert: true })}
          >
            <ThemePicker
              value={theme}
              onChange={setTheme}
            />
          </div>
        </div>
      </PortalProvider>
    </div>
  );
}
