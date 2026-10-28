import { type ReactNode, useEffect, useRef, useState } from 'react';

import { Button } from '../components/ui/Button.js';
import type { AgentView } from '../views/agentViews.js';
import { addAttachments, type Attachment, IMAGE_TYPES, imageFiles } from './chatImages.js';

/** What sending answers: nothing when it went, or why it did not. */
export type SendResult = string | undefined;

/**
 * Where you write to an agent in its chat: text, and images pasted with
 * Ctrl+V, dropped on the chat (`dropped`) or chosen with the button, shown
 * as previews you can take out before sending. Enter sends, Shift+Enter is
 * a new line.
 */
export function Composer({
  view,
  onSend,
  dropped,
  leading,
  focusSignal = 0,
}: {
  view: AgentView;
  /** Sends; keeps what you wrote when it answers why it could not. */
  onSend: (text: string, images: Attachment[]) => Promise<SendResult>;
  /** Images dropped on the chat (a new array each drop). */
  dropped?: File[];
  /** Before the box (Jarvis's microphone). */
  leading?: ReactNode;
  /** Changes when something wants the box focused. */
  focusSignal?: number;
}) {
  const [text, setText] = useState('');
  const [images, setImages] = useState<Attachment[]>([]);
  const [note, setNote] = useState<string>();
  const [sending, setSending] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  // Typing while its terminal shows a dialog would answer the dialog instead.
  const blocked = !!view.permission || (view.kind === 'needs' && view.blocking);
  useEffect(() => {
    const el = box.current;
    // Hidden (the panel closed) it measures 0: keep the CSS height until shown.
    if (!el || el.offsetParent === null) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
    el.style.overflowY = el.scrollHeight > 140 ? 'auto' : 'hidden';
  }, [text]);
  useEffect(() => {
    if (focusSignal) box.current?.focus();
  }, [focusSignal]);

  const latest = useRef(images);
  latest.current = images;
  const add = useRef((files: File[]) => {
    if (files.length === 0) return;
    const { next, refused } = addAttachments(latest.current, files);
    latest.current = next;
    setImages(next);
    setNote(refused);
    box.current?.focus();
  }).current;
  useEffect(() => {
    if (dropped) add(dropped);
  }, [dropped, add]);

  const remove = (key: string) => {
    const gone = images.find((a) => a.key === key);
    if (gone) URL.revokeObjectURL(gone.preview);
    setImages(images.filter((a) => a.key !== key));
  };
  // Leaving the chat with images not sent: their previews go too.
  useEffect(() => () => latest.current.forEach((a) => URL.revokeObjectURL(a.preview)), []);

  const send = () => {
    const t = text.trim();
    if ((!t && images.length === 0) || blocked || sending) return;
    setSending(true);
    setNote(undefined);
    void onSend(t, images).then((failed) => {
      setSending(false);
      if (failed) {
        setNote(failed);
        return;
      }
      // The previews now belong to the sent message: not revoked here.
      setText('');
      setImages([]);
    });
  };

  const canSend = !blocked && !sending && (!!text.trim() || images.length > 0);
  return (
    <div className="border-t border-border bg-bg px-10 py-8 flex flex-col gap-6">
      {images.length > 0 && (
        <ul className="m-0 p-0 list-none flex flex-wrap gap-6" aria-label="Imágenes para mandar">
          {images.map((a) => (
            <li key={a.key} className="relative">
              <img
                src={a.preview}
                alt={a.file.name || 'Imagen pegada'}
                title={a.file.name || 'Imagen pegada'}
                className="block w-56 h-56 object-cover rounded-lg border border-border bg-bg-dark"
              />
              <button
                type="button"
                aria-label={`Sacar ${a.file.name || 'la imagen'}`}
                title="Sacar"
                onClick={() => remove(a.key)}
                className="absolute -top-6 -right-6 w-20 h-20 rounded-full border border-border bg-bg text-text-2 hover:text-text flex items-center justify-center cursor-pointer p-0"
              >
                <span className="material-symbols-sharp text-sm" aria-hidden="true">
                  close
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {note && (
        <p className="m-0 text-2xs text-danger" role="status">
          {note}
        </p>
      )}
      <div className="flex items-end gap-6">
        {leading}
        <Button
          size="icon_lg"
          variant="ghost"
          aria-label="Adjuntar una imagen"
          title="Adjuntar una imagen (también podés pegarla con Ctrl+V o arrastrarla)"
          disabled={blocked}
          onClick={() => picker.current?.click()}
        >
          <span className="material-symbols-sharp text-lg" aria-hidden="true">
            add_photo_alternate
          </span>
        </Button>
        <input
          ref={picker}
          type="file"
          accept={IMAGE_TYPES.join(',')}
          multiple
          hidden
          onChange={(e) => {
            add(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
        <textarea
          ref={box}
          rows={1}
          value={text}
          disabled={blocked}
          placeholder={blocked ? 'Primero contestá lo que te pidió' : `Escribile a ${view.name}…`}
          aria-label={`Mensaje para ${view.name}`}
          className="flex-1 min-w-0 min-h-34 resize-none text-[1em] bg-bg text-text border border-border rounded-lg px-10 py-7 outline-none placeholder:text-text-muted/70 focus:border-accent focus:ring-2 focus:ring-accent/20"
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => {
            const files = imageFiles(e.clipboardData.files);
            if (files.length === 0) return;
            // An image (a screenshot): it goes as a preview, not as text.
            e.preventDefault();
            add(files);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <Button variant="accent" size="md" disabled={!canSend} onClick={send}>
          {sending ? 'Enviando…' : 'Enviar'}
        </Button>
      </div>
    </div>
  );
}
