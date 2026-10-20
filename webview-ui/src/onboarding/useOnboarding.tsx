import { type ComponentProps, useCallback, useEffect, useRef, useState } from 'react';

import type { Directory } from '../hooks/useExtensionMessages.js';
import { IntroShow } from '../intro/IntroShow.js';
import { introSeen, wantsIntroPreview } from '../intro/introStore.js';
import { markWelcomeDone, welcomeDone } from './onboardingStore.js';
import { Tour } from './Tour.js';
import { Welcome } from './Welcome.js';

/** Agents and folders arrive just after the layout: wait this long before
 *  deciding that the office is empty. */
const SETTLE_MS = 1200;
/** Once the first agent's terminal is up, let it draw before the tour starts. */
const TOUR_DELAY_MS = 900;
/** Start the tour anyway if the terminal never shows (claude failed to start). */
const TOUR_FALLBACK_MS = 8000;

interface OnboardingOptions {
  /** The office can host agents here and is fully loaded. */
  ready: boolean;
  agents: number[];
  directories: Directory[];
  terminalAgentIds: number[];
  welcome: Omit<ComponentProps<typeof Welcome>, 'onLaunched' | 'onSkip'>;
}

/**
 * First run: the animated presentation (what the office is for, once per
 * browser or app), then the welcome for an office with no agents and no
 * folders, then the guided tour
 * once the first agent's terminal is up. The presentation and the tour can be
 * asked for again (Ajustes → Ayuda), and `?intro=1` shows the presentation.
 */
export function useOnboarding(options: OnboardingOptions) {
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [introOpen, setIntroOpen] = useState(wantsIntroPreview);
  const [tourPending, setTourPending] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const decided = useRef(false);
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });

  const { ready } = options;
  useEffect(() => {
    if (!ready || decided.current) return;
    // The presentation plays once here even in an office already in use (the
    // desktop app attached to a running one); the welcome waits for it.
    if (!introSeen()) setIntroOpen(true);
    if (welcomeDone()) {
      decided.current = true;
      return;
    }
    const timer = setTimeout(() => {
      decided.current = true;
      const { agents, directories } = latest.current;
      if (agents.length === 0 && !directories.some((d) => d.source === 'user')) {
        // A brand-new office: the welcome comes after the presentation.
        setWelcomeOpen(true);
      } else {
        // Someone already using the office: no welcome, now or later.
        markWelcomeDone();
      }
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [ready]);

  const hasTerminal = options.terminalAgentIds.length > 0;
  useEffect(() => {
    if (!tourPending) return;
    const timer = setTimeout(
      () => {
        setTourPending(false);
        setTourOpen(true);
      },
      hasTerminal ? TOUR_DELAY_MS : TOUR_FALLBACK_MS,
    );
    return () => clearTimeout(timer);
  }, [tourPending, hasTerminal]);

  const closeTour = useCallback(() => setTourOpen(false), []);
  const showTour = useCallback(() => setTourOpen(true), []);
  const showIntro = useCallback(() => setIntroOpen(true), []);
  const closeIntro = useCallback(() => setIntroOpen(false), []);

  const element = (
    <>
      {introOpen && <IntroShow onDone={closeIntro} />}
      {welcomeOpen && !introOpen && (
        <Welcome
          {...options.welcome}
          onLaunched={() => {
            setWelcomeOpen(false);
            setTourPending(true);
          }}
          onSkip={() => setWelcomeOpen(false)}
        />
      )}
      {tourOpen && <Tour onClose={closeTour} />}
    </>
  );

  return { element, showTour, showIntro };
}
