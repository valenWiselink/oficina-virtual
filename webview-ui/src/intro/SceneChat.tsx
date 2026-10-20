import { CLAWD_BODY_COLORS } from '../constants.js';
import { Caption } from './Caption.js';
import { IntroClawd } from './IntroClawd.js';
import { streamedWords, typedText } from './introTimeline.js';
import { type CueAt, cueRun, useCues } from './useCues.js';
import { useSceneClock } from './useSceneClock.js';

const ASK = 'hacé el PR, porfa';
const ASK_FROM_MS = 900;
const ASK_MS_PER_CHAR = 65;
const SENT_AT_MS = ASK_FROM_MS + ASK.length * ASK_MS_PER_CHAR + 250;
const REPLY =
  'Listo: abrí el PR con los cambios. Los tests pasan y dejé el resumen en la descripción.';
const REPLY_FROM_MS = SENT_AT_MS + 600;
const REPLY_MS_PER_WORD = 110;
const YOUR_TURN_AT_MS = REPLY_FROM_MS + REPLY.split(' ').length * REPLY_MS_PER_WORD + 300;
// Split so the "#" next to digits is not read as a colour.
const YOUR_TURN = 'Te toca: mergear el PR #' + '812';

const CUES: readonly CueAt[] = [
  ...cueRun('tap', ASK_FROM_MS, ASK_MS_PER_CHAR, ASK.length),
  [SENT_AT_MS, 'send'],
  [REPLY_FROM_MS, 'pop'],
  [YOUR_TURN_AT_MS, 'ding'],
];

/**
 * Scene 5: the panel beside the board — you type a message, Claude answers
 * word by word, and its "Te toca" line lights up.
 */
export function SceneChat() {
  useCues(CUES);
  const t = useSceneClock();
  const asked = typedText(ASK, ASK_FROM_MS, ASK_MS_PER_CHAR, t);
  const sent = t >= SENT_AT_MS;
  const reply = streamedWords(REPLY, REPLY_FROM_MS, REPLY_MS_PER_WORD, t);
  return (
    <div className="intro-scene flex flex-col items-center justify-center gap-24">
      <div className="intro-panel intro-slide-in w-[min(460px,90vw)] rounded-2xl overflow-hidden">
        <div className="flex items-center gap-8 px-12 py-8 border-b border-border">
          <IntroClawd color={CLAWD_BODY_COLORS[0]} size={26} pose={reply ? 'type' : 'idle'} />
          <span className="text-sm font-semibold text-text">Pagos</span>
          <span className="ml-auto flex rounded-md bg-bg-thumb p-2 text-2xs">
            <span className="rounded-sm bg-bg px-6 py-1 text-text shadow-soft">Chat</span>
            <span className="px-6 py-1 text-text-muted">Terminal</span>
          </span>
        </div>
        <div className="flex flex-col gap-8 p-12 min-h-[188px]">
          {sent && <Bubble mine text={ASK} />}
          {reply && <Bubble text={reply} />}
          {t >= YOUR_TURN_AT_MS && (
            <div className="intro-your-turn intro-fade-up rounded-md px-10 py-6 text-xs font-semibold">
              {YOUR_TURN}
            </div>
          )}
        </div>
        <div className="flex items-center gap-8 px-12 py-8 border-t border-border">
          <span className="flex-1 rounded-lg bg-bg-dark px-10 py-6 text-xs text-text min-h-[28px]">
            {sent ? <span className="text-text-muted">Escribile a Pagos…</span> : asked}
            {!sent && <span className="intro-caret" />}
          </span>
          <span
            className={`intro-send rounded-lg px-10 py-6 text-xs font-semibold ${sent ? 'intro-send-pressed' : ''}`}
          >
            Enviar
          </span>
        </div>
      </div>
      <Caption
        title="Hablales sin cambiar de ventana"
        sub="En el chat o en su terminal, como prefieras"
        delayMs={2200}
      />
    </div>
  );
}

function Bubble({ text, mine = false }: { text: string; mine?: boolean }) {
  return (
    <div
      className={`intro-bubble intro-pop max-w-[85%] rounded-xl px-10 py-6 text-xs leading-relaxed ${
        mine ? 'self-end intro-bubble-mine' : 'self-start bg-bg-dark text-text'
      }`}
    >
      {text}
    </div>
  );
}
