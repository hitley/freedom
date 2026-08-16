/**
 * Money formatting + the app's home currency.
 *
 * The app totals everything in a single **home currency** (`HOME_CURRENCY`).
 * Individual holdings may be recorded in their own currency (e.g. a UK pension in
 * GBP) and are converted to the home currency for display and aggregation — see
 * `convertToHome` in `@/lib/investments`. Amounts here are already in whatever
 * `currency` you pass; conversion happens upstream, formatting happens here.
 *
 * Locale stays `en-GB` throughout; the *currency* drives the symbol. We use the
 * **narrow** symbol, so the home currency (AUD) renders as a plain "$1,234" — at
 * this stage the app doesn't distinguish dollar variants, "$" means AUD — while a
 * foreign holding still shows its own symbol (GBP as "£1,234").
 */

/** The currency the whole app totals and displays in. */
export const HOME_CURRENCY = "AUD";

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(currency: string, maximumFractionDigits: number): Intl.NumberFormat {
  const key = `${currency}:${maximumFractionDigits}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      maximumFractionDigits,
    });
    formatters.set(key, f);
  }
  return f;
}

/** Format an amount already denominated in `currency` (defaults to home). */
export function formatMoney(
  amount: number,
  currency: string = HOME_CURRENCY,
  maximumFractionDigits = 0,
): string {
  return formatter(currency, maximumFractionDigits).format(amount);
}

/** The currency symbol for `currency` (defaults to home), e.g. "$" or "£". */
export function currencySymbol(currency: string = HOME_CURRENCY): string {
  const part = formatter(currency, 0)
    .formatToParts(0)
    .find((p) => p.type === "currency");
  return part?.value ?? currency;
}

/** The home currency's symbol, e.g. "A$". */
export const HOME_SYMBOL = currencySymbol(HOME_CURRENCY);
