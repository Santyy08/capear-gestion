export class InvalidDecimalError extends Error {
  constructor(value: string) {
    super(`El valor "${value}" no es un decimal válido.`);
    this.name = "InvalidDecimalError";
  }
}

interface ParsedDecimal {
  coefficient: bigint;
  scale: number;
}

function parseDecimal(value: string): ParsedDecimal {
  const canonical = value.trim().replace(",", ".");
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(canonical)) {
    throw new InvalidDecimalError(value);
  }

  const sign = canonical.startsWith("-") ? -1n : 1n;
  const unsigned = canonical.replace(/^[+-]/, "");
  const [whole, fraction = ""] = unsigned.split(".");

  return {
    coefficient: sign * BigInt(`${whole}${fraction}`),
    scale: fraction.length,
  };
}

function formatDecimal({ coefficient, scale }: ParsedDecimal): string {
  const sign = coefficient < 0n ? "-" : "";
  const digits = (coefficient < 0n ? -coefficient : coefficient)
    .toString()
    .padStart(scale + 1, "0");
  const whole = scale === 0 ? digits : digits.slice(0, -scale);
  const fraction =
    scale === 0 ? "" : digits.slice(-scale).replace(/0+$/, "");
  const normalizedWhole = whole.replace(/^0+(?=\d)/, "");

  if (!fraction) return `${sign}${normalizedWhole}`;
  return `${sign}${normalizedWhole}.${fraction}`;
}

function alignDecimals(
  left: ParsedDecimal,
  right: ParsedDecimal,
): { left: bigint; right: bigint; scale: number } {
  const scale = Math.max(left.scale, right.scale);

  return {
    left: left.coefficient * 10n ** BigInt(scale - left.scale),
    right: right.coefficient * 10n ** BigInt(scale - right.scale),
    scale,
  };
}

function divideAndRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  const absoluteRemainder = remainder < 0n ? -remainder : remainder;
  const absoluteDenominator = denominator < 0n ? -denominator : denominator;
  if (remainder === 0n || absoluteRemainder * 2n < absoluteDenominator) {
    return quotient;
  }

  return quotient + ((numerator < 0n) === (denominator < 0n) ? 1n : -1n);
}

export function normalizeDecimal(value: string): string {
  return formatDecimal(parseDecimal(value));
}

/**
 * Normalizes a decimal typed by an es-AR user (comma or dot as the single
 * decimal separator). Returns null instead of throwing so forms can show a
 * field error. Thousands separators are rejected, never guessed.
 */
export function normalizeDecimalInput(input: string): string | null {
  const candidate = input.trim().replace(",", ".");
  if (!/^-?\d+(?:\.\d+)?$/.test(candidate)) return null;

  return normalizeDecimal(candidate);
}

export function compareDecimals(left: string, right: string): -1 | 0 | 1 {
  const aligned = alignDecimals(parseDecimal(left), parseDecimal(right));

  return aligned.left === aligned.right ? 0 : aligned.left < aligned.right ? -1 : 1;
}

export function addDecimals(left: string, right: string): string {
  const aligned = alignDecimals(parseDecimal(left), parseDecimal(right));
  return formatDecimal({ coefficient: aligned.left + aligned.right, scale: aligned.scale });
}

export function subtractDecimals(left: string, right: string): string {
  const aligned = alignDecimals(parseDecimal(left), parseDecimal(right));
  return formatDecimal({ coefficient: aligned.left - aligned.right, scale: aligned.scale });
}

export function multiplyDecimals(left: string, right: string): string {
  const a = parseDecimal(left);
  const b = parseDecimal(right);
  return formatDecimal({
    coefficient: a.coefficient * b.coefficient,
    scale: a.scale + b.scale,
  });
}

/** Rounds half away from zero to `places` decimals, exactly like Postgres `round(numeric, int)`. */
export function roundDecimal(value: string, places: number): string {
  if (!Number.isInteger(places) || places < 0) throw new InvalidDecimalError(String(places));
  const parsed = parseDecimal(value);
  if (parsed.scale <= places) return formatDecimal(parsed);
  const divisor = 10n ** BigInt(parsed.scale - places);
  return formatDecimal({ coefficient: divideAndRoundHalfUp(parsed.coefficient, divisor), scale: places });
}

/**
 * `numerator / denominator` rounded half away from zero to `places` decimals, exactly like Postgres
 * `round(numerator / denominator, places)`: one division on bigint, one rounding, no intermediate rounding.
 */
export function divideAndRound(numerator: string, denominator: string, places: number): string {
  if (!Number.isInteger(places) || places < 0) throw new InvalidDecimalError(String(places));
  const dividend = parseDecimal(numerator);
  const divisor = parseDecimal(denominator);
  if (divisor.coefficient === 0n) throw new InvalidDecimalError(denominator);

  return formatDecimal({
    coefficient: divideAndRoundHalfUp(
      dividend.coefficient * 10n ** BigInt(divisor.scale + places),
      divisor.coefficient * 10n ** BigInt(dividend.scale),
    ),
    scale: places,
  });
}

export function percentageOf(
  numerator: string,
  denominator: string,
  precision: number,
): string {
  if (!Number.isInteger(precision) || precision < 0) {
    throw new InvalidDecimalError(String(precision));
  }

  const numeratorDecimal = parseDecimal(numerator);
  const denominatorDecimal = parseDecimal(denominator);
  if (denominatorDecimal.coefficient === 0n) {
    throw new InvalidDecimalError(denominator);
  }

  const scaledNumerator =
    numeratorDecimal.coefficient *
    100n *
    10n ** BigInt(precision + denominatorDecimal.scale);
  const scaledDenominator =
    denominatorDecimal.coefficient * 10n ** BigInt(numeratorDecimal.scale);

  return formatDecimal({
    coefficient: divideAndRoundHalfUp(scaledNumerator, scaledDenominator),
    scale: precision,
  });
}
