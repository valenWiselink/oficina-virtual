import { useEffect, useState } from 'react';

import { Choices } from '../agents/Choices.js';
import { Button } from '../components/ui/Button.js';
import { TextInput } from '../components/ui/TextInput.js';
import { transport } from '../transport/index.js';
import { requestJarvisVoice, sayTest, useJarvisVoice } from './jarvisVoice.js';

const ENGINES = [
  { value: 'off', label: 'Sin voz' },
  { value: 'fish', label: 'Fish Audio' },
  { value: 'elevenlabs', label: 'ElevenLabs' },
] as const;

const TEST_PHRASE = 'Buenas tardes, señor. Todo en orden en la oficina.';

/**
 * Ajustes → Jarvis → Voz: which engine speaks for Jarvis, its key and its
 * voice. The key goes to the office and stays there (it is never shown back:
 * only «guardada»). Fish Audio's free model is free through 30/11/2026;
 * ElevenLabs spends the credits of your plan; when it cannot (no key, no
 * credit), Jarvis speaks with Fish instead.
 */
export function JarvisVoiceSettings() {
  const { status, error } = useJarvisVoice();
  const [key, setKey] = useState('');
  const [voice, setVoice] = useState('');
  useEffect(() => requestJarvisVoice(), []);

  const engine = status?.engine ?? 'off';
  const fish = engine === 'fish';
  const keySet = fish ? status?.fishKeySet : status?.elevenKeySet;
  const savedVoice = (fish ? status?.fishVoice : status?.elevenVoice) ?? '';
  useEffect(() => setVoice(savedVoice), [savedVoice, engine]);

  const save = (change: Record<string, unknown>) =>
    transport.send({ type: 'setJarvisVoice', ...change });

  return (
    <div className="flex flex-col gap-10 px-8 py-4">
      <Choices
        legend="Voz de Jarvis"
        choices={ENGINES}
        value={engine}
        onChange={(value) => save({ engine: value ?? 'off' })}
      />
      {engine !== 'off' && (
        <>
          <p className="m-0 text-xs text-text-2">
            {fish
              ? 'Gratis hasta el 30/11/2026 (modelo s2.1-pro-free). La clave se crea en fish.audio, en la sección de API.'
              : 'Gasta créditos de tu plan de ElevenLabs (modelo Flash, el más barato que habla castellano). Si ElevenLabs no puede (sin crédito o sin clave), Jarvis habla con Fish.'}
          </p>
          <form
            className="flex items-center gap-6"
            onSubmit={(e) => {
              e.preventDefault();
              if (!key.trim()) return;
              save(fish ? { fishKey: key.trim() } : { elevenKey: key.trim() });
              setKey('');
            }}
          >
            <label htmlFor="jarvis-voice-key" className="sr-only">
              Clave de {fish ? 'Fish Audio' : 'ElevenLabs'}
            </label>
            <TextInput
              id="jarvis-voice-key"
              type="password"
              autoComplete="off"
              className="flex-1 min-w-0"
              placeholder={
                keySet
                  ? 'Clave guardada · pegá otra para cambiarla'
                  : `Clave de ${fish ? 'Fish Audio' : 'ElevenLabs'}`
              }
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
            <Button type="submit" size="md" disabled={!key.trim()}>
              Guardar
            </Button>
          </form>
          <form
            className="flex items-center gap-6"
            onSubmit={(e) => {
              e.preventDefault();
              save(fish ? { fishVoice: voice.trim() } : { elevenVoice: voice.trim() });
            }}
          >
            <label htmlFor="jarvis-voice-id" className="sr-only">
              Id de la voz
            </label>
            <TextInput
              id="jarvis-voice-id"
              autoComplete="off"
              className="flex-1 min-w-0"
              placeholder={
                fish ? 'Id de la voz (vacío: Marcus)' : 'Id de la voz (vacío: Edoardo, latino)'
              }
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
            />
            <Button type="submit" size="md" disabled={voice.trim() === savedVoice}>
              Usar
            </Button>
          </form>
          <div className="flex items-center gap-8">
            <Button size="md" disabled={!keySet} onClick={() => sayTest(TEST_PHRASE)}>
              Probar
            </Button>
            <span className="text-xs text-text-2">
              {keySet ? 'Dice una frase corta con esta voz.' : 'Falta la clave.'}
            </span>
          </div>
        </>
      )}
      {error && (
        <p className="m-0 text-xs text-danger" role="status">
          {error}
        </p>
      )}
    </div>
  );
}
