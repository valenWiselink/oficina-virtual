import { useFolderPicker } from '../hooks/useFolderPicker.js';
import { Button } from './ui/Button.js';
import { TextInput } from './ui/TextInput.js';

/** A folder path: typed, or chosen with the system's picker. */
export function FolderField({
  value,
  onChange,
  autoFocus,
}: {
  value: string;
  onChange: (path: string) => void;
  autoFocus?: boolean;
}) {
  const { pick, picking } = useFolderPicker(onChange);
  return (
    <span className="flex gap-6">
      <TextInput
        value={value}
        autoFocus={autoFocus}
        placeholder="C:\proyectos\mi-proyecto"
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 min-w-0"
      />
      <Button
        type="button"
        size="md"
        onClick={pick}
        disabled={picking}
        title="Abrir el selector de carpetas"
        className="flex items-center gap-4 shrink-0"
      >
        <span className="material-symbols-sharp text-base" aria-hidden="true">
          folder_open
        </span>
        {picking ? 'Eligiendo…' : 'Elegir…'}
      </Button>
    </span>
  );
}
