import type { RentalDetail } from "@/lib/rentals/get-rental-detail";
import { formatRentalPrices } from "@/lib/rental-display";

const moveInLabel = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

const depositLabel = (amount: number | null, currency: string) =>
  amount == null ? "Not stated" : `${currency.toUpperCase()} ${amount.toLocaleString("en-US")}`;

type Props = {
  /** The listing as the canonical detail read returns it; null when it is no longer readable. */
  detail: RentalDetail | null;
  fallbackTitle: string;
  startDate: string;
  endDate: string | null;
};

/**
 * SAN-481 — the booking review summary: what the renter is about to book, in the listing's
 * own currency. Known facts only: an unpublished price stays "not stated" and the payable
 * amount is never estimated here (the server prices it at payment time, SAN-1240).
 */
export function BookingReviewSummary({ detail, fallbackTitle, startDate, endDate }: Props) {
  const prices = formatRentalPrices(detail?.priceNightly, detail?.priceMonthly, detail?.currency);
  const leadPrice = prices.monthlyLabel ?? prices.nightlyLabel;

  return (
    <section
      data-testid="booking-review-summary"
      className="rounded-xl border border-border p-4"
      aria-label="Booking summary"
    >
      <div className="flex flex-col gap-4 sm:flex-row">
        {detail?.images?.[0] ? (
          // eslint-disable-next-line @next/next/no-img-element -- listing photos are remote, unoptimised URLs
          <img
            src={detail.images[0]}
            alt=""
            className="h-24 w-full rounded-lg object-cover sm:h-24 sm:w-36"
            loading="lazy"
          />
        ) : null}
        <div className="min-w-0">
          <h2 className="text-lg font-semibold leading-tight" data-testid="booking-review-title">
            {detail?.title ?? fallbackTitle}
          </h2>
          {detail?.neighborhood ? (
            <p className="text-sm text-muted-foreground">{detail.neighborhood}</p>
          ) : null}
          <p className="mt-2 text-sm" data-testid="booking-review-price">
            {leadPrice ?? "Price not stated"}
            {detail && detail.deposit != null ? (
              <span className="text-muted-foreground">
                {" "}
                · Deposit {depositLabel(detail.deposit, detail.currency)}
              </span>
            ) : null}
          </p>
        </div>
      </div>

      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2" data-testid="booking-review-dates">
        <div>
          <dt className="text-xs uppercase text-muted-foreground">Move-in</dt>
          <dd className="font-medium">{startDate ? moveInLabel(startDate) : "Choose a date below"}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-muted-foreground">Move-out</dt>
          <dd className="font-medium">{!startDate ? "—" : endDate ? moveInLabel(endDate) : "Open-ended"}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-muted-foreground">Minimum stay</dt>
          <dd className="font-medium">
            {detail?.minimumStayDays != null ? `${detail.minimumStayDays} days` : "Not specified"}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-muted-foreground">Listing reference</dt>
          <dd className="font-mono text-xs">{detail?.id ?? "—"}</dd>
        </div>
      </dl>

      {detail?.houseRules ? (
        <div className="mt-4 text-sm" data-testid="booking-review-terms">
          <p className="text-xs uppercase text-muted-foreground">House rules</p>
          <p className="mt-1 whitespace-pre-line">{detail.houseRules}</p>
        </div>
      ) : null}

      <div className="mt-4 rounded-lg bg-muted/40 p-3 text-sm" data-testid="booking-review-amount-due">
        <p className="font-medium">Amount due</p>
        <p className="mt-1 text-muted-foreground">
          {leadPrice
            ? "The rent above is the advertiser’s listed price. The exact payable amount and deposit are calculated and shown at the payment step, before any card is charged."
            : "No price is published for this listing, so no payment can be started."}
        </p>
      </div>
    </section>
  );
}
