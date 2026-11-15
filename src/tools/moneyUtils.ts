/**
 * Converts YNAB milliunits (1000 = $1.00) to a dollar number rounded to cents.
 * Returns a number, not a string, so agents can compare and sum it directly.
 */
export function toDollars(milliunits: number): number {
  return Math.round(milliunits / 10) / 100;
}
