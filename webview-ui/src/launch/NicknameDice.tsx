import { Button } from '../components/ui/Button.js';
import { rollNickname } from './nicknames.js';

/** A dice beside the name field: rolls a fun name for the new Clawd. */
export function NicknameDice({
  current,
  onRoll,
}: {
  current: string;
  onRoll: (name: string) => void;
}) {
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      title="Sugerime un nombre"
      aria-label="Sugerime un nombre"
      onClick={() => onRoll(rollNickname(Math.random(), current))}
    >
      <span className="material-symbols-sharp text-lg" aria-hidden="true">
        casino
      </span>
    </Button>
  );
}
