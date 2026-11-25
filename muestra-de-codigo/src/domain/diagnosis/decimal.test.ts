import { describe, expect, it } from "vitest";
import {
  addDecimals,
  InvalidDecimalError,
  compareDecimals,
  divideAndRound,
  multiplyDecimals,
  normalizeDecimal,
  normalizeDecimalInput,
  percentageOf,
  roundDecimal,
  subtractDecimals,
} from "./decimal";

describe("diagnosis decimal values", () => {
  it.each([
    ["137,020", "137.02"],
    ["0018.5000", "18.5"],
    ["-0,380", "-0.38"],
    ["24", "24"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeDecimal(input)).toBe(expected);
  });

  it("compares values without binary floating-point", () => {
    expect(compareDecimals("137.045", "137.030")).toBe(1);
    expect(compareDecimals("0.145", "0.1450")).toBe(0);
    expect(compareDecimals("18.5", "24")).toBe(-1);
  });

  it.each(["", "1,2,3", "NaN", "Infinity", "12 mm"])(
    "rejects %s",
    (input) => expect(() => normalizeDecimal(input)).toThrow(InvalidDecimalError),
  );

  it("accepts es-AR comma decimals and normalizes them", () => {
    expect(normalizeDecimalInput("0,05")).toBe("0.05");
    expect(normalizeDecimalInput("120,350")).toBe("120.35");
    expect(normalizeDecimalInput("1.234,5")).toBeNull(); // thousands separators are rejected, not guessed
  });

  it.each(["", "  ", "12,3,4", "NaN", "12 mm", "+1", "1e3", ","])(
    "returns null for the unparsable input %j",
    (input) => expect(normalizeDecimalInput(input)).toBeNull(),
  );

  it("trims the input and keeps the sign", () => {
    expect(normalizeDecimalInput("  -0,380 ")).toBe("-0.38");
    expect(normalizeDecimalInput("24")).toBe("24");
  });

  it("calculates revision deltas without Number arithmetic", () => {
    expect(addDecimals("258500", "120000")).toBe("378500");
    expect(subtractDecimals("457985", "312785")).toBe("145200");
    expect(multiplyDecimals("378500", "0.21")).toBe("79485");
    expect(percentageOf("145200", "312785", 2)).toBe("46.42");
  });

  it("rounds an exact percentage tie half-up", () => {
    expect(percentageOf("1", "8", 0)).toBe("13");
  });

  it("rejects a percentage with a zero denominator", () => {
    expect(() => percentageOf("1", "0", 2)).toThrow(InvalidDecimalError);
  });
});

describe("roundDecimal", () => {
  it.each([
    ["2.345", 2, "2.35"], ["2.344", 2, "2.34"], ["-2.345", 2, "-2.35"], ["0.005", 2, "0.01"],
    ["10", 2, "10"], ["1187.50", 2, "1187.5"], ["33.30333", 2, "33.3"], ["87.50875", 2, "87.51"], ["0.4999", 0, "0"],
  ])("rounds %s to %i places as %s", (value, places, expected) => {
    expect(roundDecimal(value, places)).toBe(expected);
  });

  it("rejects a negative or fractional precision", () => {
    expect(() => roundDecimal("1", -1)).toThrow(InvalidDecimalError);
    expect(() => roundDecimal("1", 1.5)).toThrow(InvalidDecimalError);
  });
});

describe("divideAndRound", () => {
  it.each([
    ["1050", "1.21", 2, "867.77"],
    ["10.005", "1", 2, "10.01"],
    ["10.0049", "1", 2, "10"],
    ["1", "3", 4, "0.3333"],
    ["2", "3", 0, "1"],
    ["-10.005", "1", 2, "-10.01"],
    ["10.005", "-1", 2, "-10.01"],
    ["-1", "-3", 2, "0.33"],
    ["0", "7", 2, "0"],
    ["1210", "1.21", 2, "1000"],
  ])("divides %s by %s to %i places (half away from zero)", (numerator, denominator, places, expected) => {
    expect(divideAndRound(numerator, denominator, places)).toBe(expected);
  });

  it("stays exact with more digits than a binary float can hold", () => {
    expect(divideAndRound("123456789012345678.9", "1", 2)).toBe("123456789012345678.9");
    expect(divideAndRound("9007199254740993", "3", 2)).toBe("3002399751580331");
  });

  it("rejects a zero denominator and invalid places", () => {
    expect(() => divideAndRound("1", "0", 2)).toThrow(InvalidDecimalError);
    expect(() => divideAndRound("1", "3", -1)).toThrow(InvalidDecimalError);
    expect(() => divideAndRound("1", "3", 1.5)).toThrow(InvalidDecimalError);
  });
});
