import { Button } from '../components/ui/Button.js';

/** Icon, title and an optional close for the update notices. */
export function NoticeHeader({
  icon,
  title,
  onClose,
  closeTitle,
}: {
  icon: string;
  title: string;
  onClose?: () => void;
  closeTitle: string;
}) {
  return (
    <div className="flex items-start gap-8">
      <span className="material-symbols-sharp text-base text-accent" aria-hidden="true">
        {icon}
      </span>
      <span className="flex-1 text-sm font-semibold text-text">{title}</span>
      {onClose && (
        <Button
          size="icon"
          variant="ghost"
          aria-label={closeTitle}
          title={closeTitle}
          onClick={onClose}
        >
          ×
        </Button>
      )}
    </div>
  );
}
