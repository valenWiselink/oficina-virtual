import { useEffect, useState } from 'react';

import type { ClaudeStatus, HooksConsentRequest } from '../../../core/src/messages.js';
import { CharacterMugShot } from '../components/CharacterMugShot.js';
import { FolderField } from '../components/FolderField.js';
import { Button } from '../components/ui/Button.js';
import { Modal } from '../components/ui/Modal.js';
import { TextInput } from '../components/ui/TextInput.js';
import type {
  Directory,
  DirectoryRejection,
  DirectorySaved,
} from '../hooks/useExtensionMessages.js';
import { ClawdColorPicker } from '../launch/ClawdColorPicker.js';
import { rememberLaunchChoice } from '../launch/launchMemory.js';
import { NicknameDice } from '../launch/NicknameDice.js';
import { transport } from '../transport/index.js';
import { markWelcomeDone } from './onboardingStore.js';
import { samePath } from './samePath.js';
import { TeTocaRuleSetting } from './TeTocaRuleSetting.js';

type Step = 'hola' | 'avisos' | 'carpeta' | 'agente';

interface WelcomeProps {
  claude: ClaudeStatus | null;
  /** The server's first-run ask to install the hooks, if it is waiting on one. */
  consent: HooksConsentRequest | null;
  onConsentAnswered: (providerId: string) => void;
  directories: Directory[];
  suggestions: string[];
  saved: DirectorySaved | null;
  rejection: DirectoryRejection | null;
  /** The first agent was launched: time for the tour. */
  onLaunched: () => void;
  onSkip: () => void;
}

const TITLES: Record<Step, string> = {
  hola: 'Bienvenido a tu Oficina',
  avisos: 'Que te avise al instante',
  carpeta: '¿Dónde vas a trabajar?',
  agente: 'Tu primer agente',
};

/**
 * First run: what the office is, the checks it needs (Claude Code, the
 * hooks), a folder, and the first agent. Shown once per browser, only to an
 * office with no agents and no folders yet.
 */
const stepsFor = (askHooks: boolean): Step[] =>
  askHooks ? ['hola', 'avisos', 'carpeta', 'agente'] : ['hola', 'carpeta', 'agente'];

export function Welcome(props: WelcomeProps) {
  // Frozen when leaving the first step; until then it follows the server's
  // ask, which arrives a moment after connecting.
  const [frozen, setFrozen] = useState<Step[] | null>(null);
  const [step, setStep] = useState<Step>('hola');
  const [chosen, setChosen] = useState<Directory | null>(null);
  const steps = frozen ?? stepsFor(props.consent !== null);
  const position = steps.indexOf(step);

  const skip = () => {
    markWelcomeDone();
    props.onSkip();
  };
  const start = () => {
    setFrozen(steps);
    setStep(steps[1]);
  };

  return (
    <Modal
      isOpen
      onClose={skip}
      title={
        <span className="flex flex-col gap-2">
          <span className="text-2xs font-medium text-text-muted">
            Paso {position + 1} de {steps.length}
          </span>
          {TITLES[step]}
        </span>
      }
      width={520}
      zIndex={80}
    >
      <div className="px-8 pb-2 flex flex-col gap-14 text-text">
        {step === 'hola' && <Hello claude={props.claude} onStart={start} onSkip={skip} />}
        {step === 'avisos' && (
          <Hooks
            consent={props.consent}
            onAnswer={(choice) => {
              if (props.consent) {
                transport.send({
                  type: 'hooksConsentResponse',
                  providerId: props.consent.providerId,
                  choice,
                });
                props.onConsentAnswered(props.consent.providerId);
              }
              setStep('carpeta');
            }}
          />
        )}
        {step === 'carpeta' && (
          <Folder
            directories={props.directories}
            suggestions={props.suggestions}
            saved={props.saved}
            rejection={props.rejection}
            onBack={() => setStep(steps[position - 1])}
            onChosen={(directory) => {
              setChosen(directory);
              setStep('agente');
            }}
          />
        )}
        {step === 'agente' && chosen && (
          <FirstAgent
            directory={chosen}
            onBack={() => setStep('carpeta')}
            onLaunched={() => {
              markWelcomeDone();
              props.onLaunched();
            }}
          />
        )}
      </div>
    </Modal>
  );
}

function Hello({
  claude,
  onStart,
  onSkip,
}: {
  claude: ClaudeStatus | null;
  onStart: () => void;
  onSkip: () => void;
}) {
  const missing = claude !== null && !claude.installed;
  return (
    <>
      <div className="flex gap-4" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((palette) => (
          <CharacterMugShot key={palette} palette={palette} hueShift={0} size={36} />
        ))}
      </div>
      <p className="m-0 text-sm leading-relaxed">
        La Oficina junta a todos tus agentes de Claude Code en un solo lugar.
      </p>
      <ul className="m-0 p-0 list-none flex flex-col gap-8 text-sm">
        <Feature icon="view_kanban" text="Ves en qué anda cada uno, de un vistazo." />
        <Feature
          icon="notifications"
          text="Te avisa cuando uno te necesita: un permiso, una pregunta o un PR para revisar."
        />
        <Feature icon="chat" text="Les escribís y los ves trabajar sin cambiar de ventana." />
      </ul>
      <ClaudeCheck claude={claude} />
      <div className="-mx-8">
        <TeTocaRuleSetting />
      </div>
      <div className="flex items-center gap-8 pt-2">
        <Button variant="ghost" size="md" onClick={onSkip}>
          Saltar
        </Button>
        <Button variant="accent" size="md" className="ml-auto" onClick={onStart} autoFocus>
          {missing ? 'Seguir igual' : 'Empezar'}
        </Button>
      </div>
    </>
  );
}

function Feature({ icon, text }: { icon: string; text: string }) {
  return (
    <li className="flex items-start gap-10">
      <span
        className="material-symbols-sharp text-base text-accent shrink-0 mt-1"
        aria-hidden="true"
      >
        {icon}
      </span>
      <span className="text-text-muted">{text}</span>
    </li>
  );
}

function ClaudeCheck({ claude }: { claude: ClaudeStatus | null }) {
  if (claude === null) {
    return <div className="text-xs text-text-muted">Buscando Claude Code en esta compu…</div>;
  }
  if (claude.installed) {
    return (
      <div className="flex items-center gap-6 text-xs text-status-success">
        <span className="material-symbols-sharp text-sm" aria-hidden="true">
          check_circle
        </span>
        Claude Code está instalado
        {/* "2.1.3 (Claude Code)": the number is enough. */}
        {claude.version && ` (${claude.version.replace(/\s*\(Claude Code\)\s*$/, '')})`}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6 rounded-lg border border-status-permission bg-status-permission-bg p-10 text-xs text-status-permission-text">
      <span className="font-semibold">No encontramos Claude Code en esta compu.</span>
      <span>
        Los agentes lo necesitan. Abrí PowerShell, pegá esta línea (es el instalador oficial, no
        necesita nada más), entrá una vez con el comando <code>claude</code> para iniciar sesión, y
        volvé a abrir la oficina:
      </span>
      <code className="rounded-md bg-bg px-8 py-5 text-text select-all">
        irm https://claude.ai/install.ps1 | iex
      </code>
      <span className="text-text-muted">
        Si ya tenés Node.js, también sirve: <code>npm install -g @anthropic-ai/claude-code</code>
      </span>
    </div>
  );
}

function Hooks({
  consent,
  onAnswer,
}: {
  consent: HooksConsentRequest | null;
  onAnswer: (choice: 'install' | 'notNow') => void;
}) {
  return (
    <>
      <p className="m-0 text-sm leading-relaxed">
        Para enterarse en el momento de que un agente te pide permiso o terminó, la Oficina suma
        unos avisos (hooks) a la configuración de Claude Code, en{' '}
        <code className="text-xs">~/.claude/settings.json</code>.
      </p>
      <p className="m-0 text-sm text-text-muted leading-relaxed">
        No cambian lo que hacen tus agentes: sólo le cuentan a la oficina qué pasa. Los podés sacar
        cuando quieras desde Ajustes. Sin ellos la oficina igual anda, pero se entera unos segundos
        más tarde.
      </p>
      {consent && (
        <details className="text-xs text-text-muted">
          <summary className="cursor-pointer">El detalle técnico (en inglés)</summary>
          <p className="mt-6 mb-0 whitespace-pre-wrap">{consent.disclosure}</p>
        </details>
      )}
      <div className="flex items-center gap-8 pt-2">
        <Button variant="ghost" size="md" onClick={() => onAnswer('notNow')}>
          Ahora no
        </Button>
        <Button
          variant="accent"
          size="md"
          className="ml-auto"
          onClick={() => onAnswer('install')}
          autoFocus
        >
          Activar (recomendado)
        </Button>
      </div>
    </>
  );
}

function Folder({
  directories,
  suggestions,
  saved,
  rejection,
  onBack,
  onChosen,
}: {
  directories: Directory[];
  suggestions: string[];
  saved: DirectorySaved | null;
  rejection: DirectoryRejection | null;
  onBack: () => void;
  onChosen: (directory: Directory) => void;
}) {
  const [path, setPath] = useState('');
  const [error, setError] = useState<string | null>(null);
  // While waiting for the server to accept the folder: the acks seen before asking.
  const [waiting, setWaiting] = useState<{ saved: number; rejected: number } | null>(null);

  useEffect(() => {
    transport.send({ type: 'requestDirectorySuggestions' });
  }, []);

  useEffect(() => {
    if (!waiting) return;
    if (saved && saved.seq > waiting.saved) {
      setWaiting(null);
      onChosen(saved.directory);
    } else if (rejection && rejection.seq > waiting.rejected) {
      setWaiting(null);
      setError(rejection.reason);
    }
  }, [waiting, saved, rejection, onChosen]);

  const options = [...directories.map((d) => d.path), ...suggestions].filter(
    (p, i, all) => all.findIndex((q) => samePath(p, q)) === i,
  );

  const next = () => {
    const wanted = path.trim();
    if (!wanted) {
      setError('Escribí la carpeta o elegí una de la lista.');
      return;
    }
    setError(null);
    const known = directories.find((d) => samePath(d.path, wanted));
    if (known) {
      onChosen(known);
      return;
    }
    setWaiting({ saved: saved?.seq ?? 0, rejected: rejection?.seq ?? 0 });
    transport.send({ type: 'saveDirectory', name: '', path: wanted });
  };

  return (
    <form
      className="flex flex-col gap-14"
      onSubmit={(e) => {
        e.preventDefault();
        next();
      }}
    >
      <p className="m-0 text-sm text-text-muted leading-relaxed">
        Elegí la carpeta de tu proyecto (tu repo). El agente va a trabajar ahí. Después podés sumar
        más desde «+ Agente».
      </p>
      <label className="flex flex-col gap-4 text-xs font-medium text-text">
        Carpeta
        <FolderField value={path} onChange={setPath} autoFocus />
      </label>
      {options.length > 0 && (
        <div className="flex flex-col gap-4">
          <span className="text-xs font-medium text-text">Donde ya trabajaste con Claude</span>
          <div className="flex flex-col max-h-160 overflow-y-auto thin-scrollbar">
            {options.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setPath(option)}
                title={option}
                className={`shrink-0 flex items-center gap-6 text-sm text-left py-5 px-6 border-none rounded-lg cursor-pointer ${
                  samePath(option, path)
                    ? 'bg-active-bg text-text'
                    : 'bg-transparent text-text-muted hover:text-text hover:bg-btn-bg'
                }`}
              >
                <span className="material-symbols-sharp text-sm" aria-hidden="true">
                  folder
                </span>
                <span className="overflow-hidden text-ellipsis whitespace-nowrap">{option}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {error && (
        <div role="alert" className="text-xs text-danger">
          {error}
        </div>
      )}
      <div className="flex items-center gap-8">
        <Button type="button" variant="ghost" size="md" onClick={onBack}>
          Atrás
        </Button>
        <Button
          type="submit"
          variant="accent"
          size="md"
          className="ml-auto"
          disabled={waiting !== null}
        >
          {waiting ? 'Revisando…' : 'Seguir'}
        </Button>
      </div>
    </form>
  );
}

function FirstAgent({
  directory,
  onBack,
  onLaunched,
}: {
  directory: Directory;
  onBack: () => void;
  onLaunched: () => void;
}) {
  const [nickname, setNickname] = useState('');
  const [palette, setPalette] = useState(0);

  const launch = () => {
    const name = nickname.trim();
    rememberLaunchChoice(directory.path, { nickname: name, palette });
    transport.send({
      type: 'launchAgent',
      directoryPath: directory.path,
      nickname: name || undefined,
      palette,
      hueShift: 0,
    });
    onLaunched();
  };

  return (
    <form
      className="flex flex-col gap-14"
      onSubmit={(e) => {
        e.preventDefault();
        launch();
      }}
    >
      <p className="m-0 text-sm text-text-muted leading-relaxed">
        Va a trabajar en{' '}
        <span className="text-text font-medium" title={directory.path}>
          {directory.name}
        </span>
        . Ponele un nombre que te diga en qué anda, y un color para reconocerlo.
      </p>
      <label className="flex flex-col gap-4 text-xs font-medium text-text">
        <span>
          Nombre <span className="font-normal text-text-muted">(opcional)</span>
        </span>
        <span className="flex items-center gap-4">
          <TextInput
            value={nickname}
            autoFocus
            maxLength={32}
            className="flex-1"
            placeholder="Por ejemplo: Pagos, Revisor, WISE-6082"
            onChange={(e) => setNickname(e.target.value)}
          />
          <NicknameDice current={nickname} onRoll={setNickname} />
        </span>
      </label>
      <ClawdColorPicker value={palette} onChange={setPalette} />
      <p className="m-0 text-xs text-text-muted leading-relaxed">
        Si es la primera vez que usás Claude Code en esta compu, en la terminal del agente te va a
        pedir que elijas unas opciones e inicies sesión: seguí los pasos ahí.
      </p>
      <div className="flex items-center gap-8">
        <Button type="button" variant="ghost" size="md" onClick={onBack}>
          Atrás
        </Button>
        <Button type="submit" variant="accent" size="md" className="ml-auto">
          Crear mi primer agente
        </Button>
      </div>
    </form>
  );
}
