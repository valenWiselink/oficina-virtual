import { useState } from 'react';

import { Button } from '../components/ui/Button.js';
import { Modal } from '../components/ui/Modal.js';
import { TextInput } from '../components/ui/TextInput.js';
import type { Workspace } from './workspaceRules.js';
import { createWorkspace, deleteWorkspace, updateWorkspace } from './workspaceStore.js';

/**
 * Create or edit a workspace: its name and which folders' agents land in it
 * by themselves (any agent can also be moved in by hand from its card).
 * Deleting one only drops the grouping: its agents go back to "Todos".
 */
export function WorkspaceDialog({
  editing,
  folders,
  onClose,
}: {
  /** undefined: closed; null: a new one; a workspace: edit it. */
  editing: Workspace | null | undefined;
  /** Folders the office knows (its agents' and the saved Directories). */
  folders: string[];
  onClose: () => void;
}) {
  return (
    <Modal
      isOpen={editing !== undefined}
      onClose={onClose}
      title={editing ? 'Editar espacio' : 'Nuevo espacio de trabajo'}
      zIndex={56}
      width={440}
    >
      {editing !== undefined && (
        <WorkspaceForm
          key={editing?.id ?? 'nuevo'}
          editing={editing}
          folders={folders}
          onClose={onClose}
        />
      )}
    </Modal>
  );
}

function WorkspaceForm({
  editing,
  folders,
  onClose,
}: {
  editing: Workspace | null;
  folders: string[];
  onClose: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? '');
  const [chosen, setChosen] = useState<string[]>(editing?.folders ?? []);
  const [confirming, setConfirming] = useState(false);
  const all = [...new Set([...folders, ...chosen])].sort((a, b) => a.localeCompare(b));
  const toggle = (f: string) =>
    setChosen((c) => (c.includes(f) ? c.filter((x) => x !== f) : [...c, f]));
  const save = () => {
    if (editing) updateWorkspace(editing.id, { name, folders: chosen });
    else createWorkspace(name, chosen);
    onClose();
  };
  return (
    <form
      className="flex flex-col gap-12 px-8 py-2 text-text"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <label className="flex flex-col gap-3 text-xs font-medium">
        Nombre
        <TextInput
          autoFocus
          maxLength={32}
          placeholder="Por ejemplo: Wiselink, Personal, Cliente X"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <FolderChecklist folders={all} chosen={chosen} onToggle={toggle} />
      <div className="flex items-center gap-8 pt-4">
        {editing &&
          (confirming ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-danger!"
              onClick={() => {
                deleteWorkspace(editing.id);
                onClose();
              }}
            >
              Sí, borrar el espacio
            </Button>
          ) : (
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(true)}>
              Borrar espacio…
            </Button>
          ))}
        <span className="flex-1" />
        <Button type="button" variant="ghost" size="md" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" variant="accent" size="md" disabled={!name.trim()}>
          {editing ? 'Guardar' : 'Crear espacio'}
        </Button>
      </div>
      {confirming && (
        <p className="m-0 text-xs text-text-muted">Sus agentes no se cierran: vuelven a «Todos».</p>
      )}
    </form>
  );
}

function FolderChecklist({
  folders,
  chosen,
  onToggle,
}: {
  folders: string[];
  chosen: string[];
  onToggle: (folder: string) => void;
}) {
  return (
    <fieldset className="m-0 p-0 border-0 flex flex-col gap-4">
      <legend className="text-xs font-medium pb-3">Carpetas que entran solas</legend>
      {folders.length === 0 ? (
        <p className="m-0 text-xs text-text-muted">
          Todavía no hay carpetas: podés mover agentes a mano desde su tarjeta.
        </p>
      ) : (
        <div className="flex flex-col gap-2 max-h-200 overflow-y-auto thin-scrollbar">
          {folders.map((f) => (
            <label key={f} className="flex items-center gap-8 text-sm cursor-pointer py-2">
              <input type="checkbox" checked={chosen.includes(f)} onChange={() => onToggle(f)} />
              {f}
            </label>
          ))}
        </div>
      )}
      <p className="m-0 text-2xs text-text-muted">
        Los agentes de estas carpetas aparecen acá solos. Cualquier otro lo podés traer con «Mover
        a…» en su tarjeta.
      </p>
    </fieldset>
  );
}
