interface GooglePlacesSummaryProps {
  summary: string | null | undefined;
  disclosure: string | null | undefined;
  className?: string;
}

/** Render Google Places provider AI text only when its required disclosure is present. */
export function GooglePlacesSummary({ summary, disclosure, className }: GooglePlacesSummaryProps) {
  const text = summary?.trim();
  const attribution = disclosure?.trim();
  if (!text || !attribution) return null;

  return (
    <div className={className} data-testid="google-places-summary">
      <p>{text}</p>
      <p className="text-xs text-muted-foreground" data-testid="google-places-summary-disclosure">
        {attribution}
      </p>
    </div>
  );
}
