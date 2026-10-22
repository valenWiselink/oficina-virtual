import { useEffect, useState } from 'react';

import { Button } from '../components/ui/Button.js';
import { ApproveButtons } from '../permissions/ApproveButtons.js';
import { describeToolInput } from '../permissions/describeToolInput.js';
import type { AgentView } from '../views/agentViews.js';
import type { BoardActions } from '../views/BoardCard.js';
import { ChoiceReplies } from '../views/CardExtras.js';
import { JarvisVoiceBars } from './JarvisRing.js';
import { jarvisLine, visorContext, visorKey } from './jarvisRules.js';

/**
 * Jarvis in the middle of the screen, only when it needs you (option D of
 * the 2026-10-22 canvas): what it asks, in large type, with the buttons to
 * answer. «Después» or Esc puts it away (it stays in the bar); the next thing
 * it needs brings it back. With a voice it will also show while it speaks.
 */
export function JarvisVisor({
  jarvis,
  actions,
  onAnswer,
}: {
  jarvis: AgentView | undefined;
  actions: BoardActions;
  /** «Contestar»: write to it in the bar. */
  onAnswer: () => void;
}) {
  const key = visorKey(jarvis);
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const shown = key !== undefined && !dismissed.has(key);

  useEffect(() => {
    if (!shown || key === undefined) return;
    // Esc only puts the visor away: the terminal still gets it (Claude Code
    // uses Esc to interrupt), so nothing is stopped here.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDismissed((d) => new Set(d).add(key));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shown, key]);

  if (!shown || !jarvis || key === undefined) return null;
  const dismiss = () => setDismissed((d) => new Set(d).add(key));
  const turnId = jarvis.yourTurnId;
  const command = jarvis.permission
    ? describeToolInput(jarvis.permission.toolName, jarvis.permission.toolInput).sections[0]
    : undefined;
  const line = jarvisLine(jarvis);
  const context = jarvis.permission ? undefined : visorContext(jarvis.lastReplyHead, line);

  return (
    <>
      <div className="absolute inset-0 z-30 bg-bg/45 pointer-events-none" aria-hidden="true" />
      <section
        role="dialog"
        aria-modal="false"
        aria-label="Jarvis le habla"
        // Above the toolbar at the foot of the office, never over it.
        className="absolute left-1/2 -translate-x-1/2 bottom-88 z-40 w-[min(720px,calc(100%-32px))] box-border soft-panel bg-bg! rounded-2xl px-24 py-20 flex flex-col items-center gap-14 text-center"
      >
        <JarvisVoiceBars />
        {context && <p className="m-0 text-sm text-text-2 max-w-[600px]">{context}</p>}
        <p className="m-0 text-xl leading-snug font-medium text-text max-w-[600px] whitespace-pre-line">
          {line}
        </p>
        {command && (
          <pre className="m-0 max-w-full max-h-120 overflow-auto text-left text-xs bg-bg-dark border border-border rounded-lg px-12 py-8 whitespace-pre-wrap break-all">
            {command.text}
          </pre>
        )}
        <div className="flex flex-wrap items-center justify-center gap-8">
          {jarvis.permission && actions.onAllow && actions.onDeny ? (
            <ApproveButtons
              permission={jarvis.permission}
              onAllow={actions.onAllow}
              onDeny={actions.onDeny}
              size="md"
            />
          ) : (
            <>
              <ChoiceReplies
                view={jarvis}
                onSent={() => {
                  if (turnId) actions.onYourTurnDone?.(turnId);
                }}
              />
              <Button
                size="md"
                variant="accent"
                onClick={() => {
                  dismiss();
                  onAnswer();
                }}
              >
                Contestar
              </Button>
              {turnId && actions.onYourTurnDone && (
                <Button size="md" onClick={() => actions.onYourTurnDone?.(turnId)}>
                  Hecho
                </Button>
              )}
            </>
          )}
          <Button size="md" variant="ghost" onClick={dismiss}>
            Después
          </Button>
        </div>
        <div className="text-2xs text-text-2">Esc para cerrarlo · sigue en la barra de abajo</div>
      </section>
    </>
  );
}
