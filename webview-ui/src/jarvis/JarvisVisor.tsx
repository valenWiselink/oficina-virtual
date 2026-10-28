import { useEffect, useState } from 'react';

import { Button } from '../components/ui/Button.js';
import { ApproveButtons } from '../permissions/ApproveButtons.js';
import { describeToolInput } from '../permissions/describeToolInput.js';
import type { AgentView } from '../views/agentViews.js';
import type { BoardActions } from '../views/BoardCard.js';
import { ChoiceReplies } from '../views/CardExtras.js';
import { useJarvisEars } from './jarvisEars.js';
import { JarvisVoiceBars } from './JarvisRing.js';
import {
  askedLine,
  type AskedPermission,
  jarvisLine,
  visorContext,
  visorKey,
} from './jarvisRules.js';
import { stopJarvis, useJarvisVoice } from './jarvisVoice.js';
import { talkToJarvis } from './talk.js';

/**
 * Jarvis in the middle of the screen (option D of the 2026-10-22 canvas):
 * when it needs you — what it asks, in large type, with the buttons to answer
 * («Después» or Esc put it away; it stays in its bubble, and the next thing it
 * needs brings it back) — and while it speaks, with what it says as subtitles.
 * When it asks you about another agent's permission, that permission is here
 * with Aprobar and Rechazar (or you tell Jarvis yes: valentinConsent.ts).
 */
export function JarvisVisor({
  jarvis,
  asked,
  actions,
  onAnswer,
}: {
  jarvis: AgentView | undefined;
  /** Another agent's permission it is asking you about (askedPermission). */
  asked?: AskedPermission;
  actions: BoardActions;
  /** «Escribirle»: write to it in its panel. */
  onAnswer: () => void;
}) {
  const { speaking } = useJarvisVoice();
  const listening = useJarvisEars().phase === 'listening';
  const key = visorKey(jarvis, asked);
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const needs = key !== undefined && !dismissed.has(key);
  const shown = !!jarvis && (needs || !!speaking);

  useEffect(() => {
    if (!shown) return;
    // Esc quiets it and puts the visor away. The terminal still gets the key
    // (Claude Code uses Esc to interrupt), so nothing is stopped here.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      stopJarvis();
      if (key !== undefined) setDismissed((d) => new Set(d).add(key));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shown, key]);

  if (!shown || !jarvis) return null;
  const dismiss = () => {
    stopJarvis();
    if (key !== undefined) setDismissed((d) => new Set(d).add(key));
  };
  const turnId = jarvis.yourTurnId;
  const ask = needs && asked && key === `pide:${asked.permission.requestId}` ? asked : undefined;
  const permission = ask?.permission ?? (needs ? jarvis.permission : undefined);
  const command = permission
    ? describeToolInput(permission.toolName, permission.toolInput).sections[0]
    : undefined;
  const line = ask ? askedLine(ask) : needs ? jarvisLine(jarvis) : (speaking?.text ?? '');
  const context = needs && !permission ? visorContext(jarvis.lastReplyHead, line) : undefined;

  return (
    <>
      <div className="absolute inset-0 z-30 bg-bg/45 pointer-events-none" aria-hidden="true" />
      <section
        role="dialog"
        aria-modal="false"
        aria-label={needs ? 'Jarvis le habla' : 'Jarvis está hablando'}
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
          {permission && actions.onAllow && actions.onDeny ? (
            <>
              <ApproveButtons
                permission={permission}
                onAllow={actions.onAllow}
                onDeny={actions.onDeny}
                size="md"
              />
              {ask && (
                <Button
                  size="md"
                  onClick={() => {
                    stopJarvis();
                    talkToJarvis(jarvis.id);
                  }}
                >
                  {listening ? 'Terminar y mandar' : 'Contestar hablando'}
                </Button>
              )}
            </>
          ) : (
            <>
              {needs && (
                <ChoiceReplies
                  view={jarvis}
                  onSent={() => {
                    if (turnId) actions.onYourTurnDone?.(turnId);
                  }}
                />
              )}
              <Button
                size="md"
                variant="accent"
                onClick={() => {
                  dismiss();
                  talkToJarvis(jarvis.id);
                }}
              >
                Contestar hablando
              </Button>
              <Button
                size="md"
                onClick={() => {
                  dismiss();
                  onAnswer();
                }}
              >
                Escribirle
              </Button>
              {needs && turnId && actions.onYourTurnDone && (
                <Button size="md" onClick={() => actions.onYourTurnDone?.(turnId)}>
                  Hecho
                </Button>
              )}
            </>
          )}
          <Button size="md" variant="ghost" onClick={dismiss}>
            {needs ? 'Después' : 'Callar'}
          </Button>
        </div>
        <div className="text-2xs text-text-2">
          Esc para {needs ? 'cerrarlo · sigue en su burbuja' : 'callarlo'}
        </div>
      </section>
    </>
  );
}
