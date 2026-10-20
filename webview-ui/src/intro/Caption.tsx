/** The scene's sentence, rising in after the action has started. */
export function Caption({
  title,
  sub,
  delayMs = 1400,
}: {
  title: string;
  sub?: string;
  delayMs?: number;
}) {
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <h2
        className="m-0 text-text intro-caption intro-fade-up"
        style={{ animationDelay: `${delayMs}ms` }}
      >
        {title}
      </h2>
      {sub && (
        <p
          className="m-0 text-base text-text-muted intro-fade-up"
          style={{ animationDelay: `${delayMs + 250}ms` }}
        >
          {sub}
        </p>
      )}
    </div>
  );
}
