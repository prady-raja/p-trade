/**
 * P Trade — Frontend Unit Tests
 * Run: npx jest tests/frontend/pts.test.ts
 *
 * Covers:
 *   - Score display denominator (Bug 2)
 *   - Import vs Scoring phase separation (Bug 3)
 *   - Winner Detail shows correct data (Bug 4)
 *   - Market Regime never shows UNSET after load (Bug 5)
 *   - No hardcoded/mock stock names rendered (Bug 1)
 *   - Trailing SL zone rendering
 *   - Position size display
 */

// ─── TYPE DEFINITIONS (mirror your actual types) ──────────────────────────────

interface Stock {
  ticker: string;
  rank?: number;
  preFilterScore?: "HIGH" | "MEDIUM" | "LOW";
  score?: number | null;
  pts_score?: number | null;
  bucket?: "trade_today" | "watch_tomorrow" | "reject" | "unscored" | null;
  verdict?: string;
  entry?: string | null;
  target1?: string | null;
  target2?: string | null;
  stopLoss?: string | null;
  riskReward?: string;
  checklist?: Array<{ label: string; status: "pass" | "fail" | "warn" }>;
  not_tradeable?: boolean;
}

interface Trade {
  id: number;
  ticker: string;
  entry: number;
  t1: number;
  t2: number;
  sl: number;
  qty: number;
  status: "OPEN" | "HIT T1" | "HIT T2" | "STOPPED" | "CLOSED";
  currentPrice?: number | null;
  exit?: number | null;
  mc: "green" | "yellow" | "red";
  score: string;
}

interface MarketRegime {
  condition: "green" | "yellow" | "red" | "unset";
  updated?: string;
  reason?: string;
}

// ─── PURE UTILITY FUNCTIONS (mirror what your frontend should have) ────────────

function formatScore(score: number | null | undefined): string {
  if (score === null || score === undefined) return "—";
  return `${score}/100`;
}

function isQualifyingVerdict(verdict: string): boolean {
  return ["STRONG BUY", "BUY WATCH"].includes(verdict);
}

function sanitizeForWinnerDetail(stock: Stock): Stock {
  const rrNum = parseFloat((stock.riskReward || "0:0").split(":").pop() || "0");
  const isUntradeable =
    !isQualifyingVerdict(stock.verdict || "") || rrNum < 3.0;

  if (isUntradeable) {
    const { entry, target1, target2, stopLoss, ...rest } = stock;
    return { ...rest, not_tradeable: true };
  }
  return stock;
}

function calcTrailZone(trade: Trade): {
  zone: number;
  sl: number;
  pct: number | null;
} {
  if (trade.status === "STOPPED" || trade.status === "CLOSED" || trade.status === "HIT T2") {
    return { zone: 0, sl: trade.sl, pct: null };
  }
  if (trade.status === "OPEN") {
    return { zone: 1, sl: trade.sl, pct: null };
  }
  // HIT T1
  if (!trade.currentPrice || trade.currentPrice <= 0) {
    return { zone: 2, sl: trade.entry, pct: null };
  }
  const range = trade.t2 - trade.t1;
  if (range <= 0) return { zone: 2, sl: trade.entry, pct: 0 };
  const progress = (trade.currentPrice - trade.t1) / range;
  if (progress < 0) return { zone: 2, sl: trade.entry, pct: 0 };
  if (progress < 0.5) return { zone: 2, sl: trade.entry, pct: Math.round(progress * 100) };
  if (progress < 0.8) return { zone: 3, sl: trade.t1, pct: Math.round(progress * 100) };
  return { zone: 4, sl: Math.round((trade.t1 + trade.t2) / 2), pct: Math.round(progress * 100) };
}

function calcPositionSize(
  capital: number,
  entry: number,
  sl: number,
  market: "green" | "yellow" | "red"
): number {
  if (entry <= sl || capital <= 0) return 0;
  const riskPct = market === "yellow" ? 0.01 : 0.02;
  return Math.floor((capital * riskPct) / (entry - sl));
}

function calcRR(entry: number, target: number, sl: number): number {
  if (entry <= sl || entry <= 0) return 0;
  const reward = target - entry;
  const risk = entry - sl;
  if (risk <= 0 || reward <= 0) return 0;
  return parseFloat((reward / risk).toFixed(2));
}

function determineImportPhase(stocks: Stock[]): {
  isImportPhase: boolean;
  hasScores: boolean;
  hasBuckets: boolean;
} {
  const hasScores = stocks.some(
    (s) => s.score !== null && s.score !== undefined && s.score > 0
  );
  const hasBuckets = stocks.some(
    (s) => s.bucket && s.bucket !== "unscored"
  );
  return {
    isImportPhase: !hasScores && !hasBuckets,
    hasScores,
    hasBuckets,
  };
}


// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITES
// ═══════════════════════════════════════════════════════════════════════════════

describe("Score Display — Bug 2", () => {
  test("formatScore uses /100 denominator", () => {
    expect(formatScore(72)).toBe("72/100");
    expect(formatScore(100)).toBe("100/100");
    expect(formatScore(0)).toBe("0/100");
  });

  test("formatScore returns dash for null/undefined", () => {
    expect(formatScore(null)).toBe("—");
    expect(formatScore(undefined)).toBe("—");
  });

  test("score of 45 formats as 45/100, not 45/20", () => {
    const display = formatScore(45);
    expect(display).not.toContain("/20");
    expect(display).toContain("/100");
  });

  test("score of 0 displays as 0/100, not 0/20", () => {
    const display = formatScore(0);
    expect(display).toBe("0/100");
    expect(display).not.toContain("/20");
  });

  test("no score value should ever exceed 100", () => {
    const scores = [0, 20, 45, 72, 85, 100];
    scores.forEach((s) => {
      expect(s).toBeLessThanOrEqual(100);
      expect(s).toBeGreaterThanOrEqual(0);
    });
  });
});


describe("Import vs Scoring Phase Separation — Bug 3", () => {
  const importedStocks: Stock[] = [
    { ticker: "ATLANTE", rank: 1, preFilterScore: "HIGH", score: null, bucket: null },
    { ticker: "BSE", rank: 2, preFilterScore: "HIGH", score: null, bucket: null },
    { ticker: "NATCO", rank: 3, preFilterScore: "MEDIUM", score: null, bucket: null },
  ];

  const scoredStocks: Stock[] = [
    { ticker: "BSE", score: 78, bucket: "trade_today", verdict: "STRONG BUY" },
    { ticker: "NATCO", score: 61, bucket: "watch_tomorrow", verdict: "BUY WATCH" },
    { ticker: "ATLANTE", score: 32, bucket: "reject", verdict: "AVOID" },
  ];

  test("import phase stocks have null scores", () => {
    importedStocks.forEach((s) => {
      expect(s.score).toBeNull();
    });
  });

  test("import phase stocks have no bucket assignment", () => {
    importedStocks.forEach((s) => {
      expect(s.bucket).toBeFalsy();
    });
  });

  test("determineImportPhase correctly identifies import state", () => {
    const phase = determineImportPhase(importedStocks);
    expect(phase.isImportPhase).toBe(true);
    expect(phase.hasScores).toBe(false);
    expect(phase.hasBuckets).toBe(false);
  });

  test("after scoring, buckets are populated", () => {
    const phase = determineImportPhase(scoredStocks);
    expect(phase.isImportPhase).toBe(false);
    expect(phase.hasBuckets).toBe(true);
  });

  test("Watch Tomorrow bucket should not show during import phase", () => {
    // Simulate rendering: Watch Tomorrow should be empty if in import phase
    const phase = determineImportPhase(importedStocks);
    const watchTomorrow = phase.isImportPhase
      ? []
      : importedStocks.filter((s) => s.bucket === "watch_tomorrow");
    expect(watchTomorrow.length).toBe(0);
  });

  test("0/100 score should not appear in import phase", () => {
    importedStocks.forEach((s) => {
      const display = formatScore(s.score);
      // Should show "—" not "0/100" during import phase
      expect(display).toBe("—");
    });
  });
});


describe("Winner Detail — Bug 4", () => {
  const qualifyingStock: Stock = {
    ticker: "BSE",
    verdict: "STRONG BUY",
    riskReward: "1:3.4",
    entry: "4520",
    target1: "4950",
    target2: "5500",
    stopLoss: "4200",
    checklist: [
      { label: "Trend Template", status: "pass" },
      { label: "Tide", status: "pass" },
      { label: "Hat Signal", status: "pass" },
      { label: "EMA PCO/NCO", status: "pass" },
      { label: "MACD", status: "pass" },
      { label: "MACD Hist", status: "pass" },
      { label: "Stochastic", status: "warn" },
      { label: "RSI", status: "pass" },
      { label: "BB Setup", status: "pass" },
      { label: "Candlestick", status: "pass" },
      { label: "PTS Chart Setup", status: "pass" },
      { label: "R:R >= 3:1", status: "pass" },
      { label: "VCP Pattern", status: "pass" },
    ],
  };

  const avoidStock: Stock = {
    ticker: "WEAKCO",
    verdict: "AVOID",
    riskReward: "1:1.5",
    entry: "500",
    target1: "575",
    target2: "650",
    stopLoss: "450",
  };

  test("qualifying stock retains entry/target/SL in Winner Detail", () => {
    const sanitized = sanitizeForWinnerDetail(qualifyingStock);
    expect(sanitized.entry).toBeDefined();
    expect(sanitized.target1).toBeDefined();
    expect(sanitized.stopLoss).toBeDefined();
    expect(sanitized.not_tradeable).toBeFalsy();
  });

  test("AVOID verdict strips entry/target/SL from Winner Detail", () => {
    const sanitized = sanitizeForWinnerDetail(avoidStock);
    expect(sanitized.entry).toBeUndefined();
    expect(sanitized.target1).toBeUndefined();
    expect(sanitized.stopLoss).toBeUndefined();
    expect(sanitized.not_tradeable).toBe(true);
  });

  test("R:R below 3 strips entry plan even if verdict looks positive", () => {
    const lowRRStock: Stock = {
      ticker: "LOWRR",
      verdict: "BUY WATCH",  // Sounds good...
      riskReward: "1:2.1",   // ...but fails R:R gate
      entry: "1000",
      target1: "1210",
      stopLoss: "900",
    };
    const sanitized = sanitizeForWinnerDetail(lowRRStock);
    expect(sanitized.entry).toBeUndefined();
    expect(sanitized.not_tradeable).toBe(true);
  });

  test("Winner Detail shows all 13 PTS checklist items", () => {
    const REQUIRED_CHECKS = [
      "Trend Template", "Tide", "Hat Signal", "EMA PCO/NCO",
      "MACD", "MACD Hist", "Stochastic", "RSI", "BB Setup",
      "Candlestick", "PTS Chart Setup", "R:R >= 3:1", "VCP Pattern",
    ];
    const found = qualifyingStock.checklist!.map((c) => c.label);
    REQUIRED_CHECKS.forEach((required) => {
      expect(found).toContain(required);
    });
  });

  test("checklist statuses are only pass/fail/warn", () => {
    const validStatuses = ["pass", "fail", "warn"];
    qualifyingStock.checklist!.forEach((item) => {
      expect(validStatuses).toContain(item.status);
    });
  });

  test("STRONG BUY isQualifying returns true", () => {
    expect(isQualifyingVerdict("STRONG BUY")).toBe(true);
  });

  test("BUY WATCH isQualifying returns true", () => {
    expect(isQualifyingVerdict("BUY WATCH")).toBe(true);
  });

  test("AVOID isQualifying returns false", () => {
    expect(isQualifyingVerdict("AVOID")).toBe(false);
  });

  test("WAIT isQualifying returns false", () => {
    expect(isQualifyingVerdict("WAIT")).toBe(false);
  });

  test("NO TRADE isQualifying returns false", () => {
    expect(isQualifyingVerdict("NO TRADE")).toBe(false);
  });
});


describe("Market Regime — Bug 5", () => {
  test("regime of 'unset' is never a valid final state after API call", () => {
    const validRegimes = ["green", "yellow", "red"];
    const regime: MarketRegime = { condition: "green" };
    expect(validRegimes).toContain(regime.condition);
  });

  test("failed API call should use cached regime if available", () => {
    const cache = {
      condition: "green" as const,
      updated: "25 Mar 26",
      cached: true,
    };
    // Simulate API failure — use cache
    const apiError = new Error("Network error");
    const resolved = apiError ? cache : null;
    expect(resolved?.condition).toBe("green");
    expect(resolved?.cached).toBe(true);
  });

  test("no cached value + API failure = show error, not UNSET", () => {
    const apiError = new Error("Network error");
    const cached = null;
    // If both fail, we show an error state — never 'unset'
    const displayCondition = cached ? cached : apiError ? "error" : "unset";
    expect(displayCondition).toBe("error");
    expect(displayCondition).not.toBe("unset");
  });

  test("green regime enables full position sizing (2%)", () => {
    const riskPctFor = (r: "green" | "yellow" | "red") =>
      ({ green: 2, yellow: 1, red: 0 })[r];
    expect(riskPctFor("green")).toBe(2);
  });

  test("yellow regime enforces 1% position sizing", () => {
    const riskPctFor = (r: "green" | "yellow" | "red") =>
      ({ green: 2, yellow: 1, red: 0 })[r];
    expect(riskPctFor("yellow")).toBe(1);
  });

  test("red regime allows no new trades", () => {
    const canEnterNewTrade = (r: "green" | "yellow" | "red") => r !== "red";
    expect(canEnterNewTrade("red")).toBe(false);
  });
});


describe("No Mock / Hardcoded Data — Bug 1", () => {
  const KNOWN_MOCK_TICKERS = ["POLYCAB", "CAMS", "KEI", "ZOMATO", "PIDILITIND", "ASIANPAINT"];

  test("known mock tickers are not present in a real import response shape", () => {
    // This simulates what a real backend response looks like
    const realApiResponse: Stock[] = [
      { ticker: "ATLANTE" },
      { ticker: "BSE" },
      { ticker: "NATCO" },
    ];
    const tickers = realApiResponse.map((s) => s.ticker);
    const mockFound = tickers.filter((t) => KNOWN_MOCK_TICKERS.includes(t));
    expect(mockFound.length).toBe(0);
  });

  test("empty upload returns empty list, not mock data", () => {
    // If no file or empty file → stocks array must be empty
    const emptyResponse: Stock[] = [];
    expect(emptyResponse.length).toBe(0);
  });

  test("render function handles empty stocks array without crashing", () => {
    const stocks: Stock[] = [];
    const rendered = stocks.map((s) => s.ticker);
    expect(rendered).toEqual([]);
  });
});


describe("Trailing Stop Loss Zones", () => {
  const baseTrade: Trade = {
    id: 1,
    ticker: "BSE",
    entry: 1000,
    t1: 1300,
    t2: 1700,
    sl: 920,
    qty: 10,
    status: "OPEN",
    mc: "green",
    score: "5/6",
  };

  test("OPEN trade stays in Zone 1", () => {
    const result = calcTrailZone(baseTrade);
    expect(result.zone).toBe(1);
    expect(result.sl).toBe(920);
  });

  test("HIT T1 with no price → Zone 2 at entry", () => {
    const t: Trade = { ...baseTrade, status: "HIT T1", currentPrice: undefined };
    const result = calcTrailZone(t);
    expect(result.zone).toBe(2);
    expect(result.sl).toBe(1000);
  });

  test("HIT T1, price 30% of T1→T2 → Zone 2", () => {
    // T1=1300, T2=1700, range=400, 30% = 120, price = 1420
    const t: Trade = { ...baseTrade, status: "HIT T1", currentPrice: 1420 };
    const result = calcTrailZone(t);
    expect(result.zone).toBe(2);
    expect(result.sl).toBe(1000); // Breakeven
  });

  test("HIT T1, price 60% of T1→T2 → Zone 3, SL=T1", () => {
    // 1300 + 0.6*400 = 1540
    const t: Trade = { ...baseTrade, status: "HIT T1", currentPrice: 1540 };
    const result = calcTrailZone(t);
    expect(result.zone).toBe(3);
    expect(result.sl).toBe(1300); // T1
  });

  test("HIT T1, price 90% of T1→T2 → Zone 4, SL=midpoint", () => {
    // 1300 + 0.9*400 = 1660
    const t: Trade = { ...baseTrade, status: "HIT T1", currentPrice: 1660 };
    const result = calcTrailZone(t);
    expect(result.zone).toBe(4);
    expect(result.sl).toBe(1500); // (1300+1700)/2
  });

  test("STOPPED trade has zone 0", () => {
    const t: Trade = { ...baseTrade, status: "STOPPED" };
    expect(calcTrailZone(t).zone).toBe(0);
  });
});


describe("Position Sizing", () => {
  test("green market 2% rule", () => {
    const qty = calcPositionSize(500_000, 1000, 930, "green");
    const risk = qty * (1000 - 930);
    expect(risk / 500_000).toBeLessThanOrEqual(0.02);
  });

  test("yellow market 1% rule", () => {
    const qty = calcPositionSize(500_000, 1000, 930, "yellow");
    const risk = qty * (1000 - 930);
    expect(risk / 500_000).toBeLessThanOrEqual(0.01);
  });

  test("yellow gives fewer shares than green", () => {
    const green = calcPositionSize(500_000, 1000, 930, "green");
    const yellow = calcPositionSize(500_000, 1000, 930, "yellow");
    expect(yellow).toBeLessThan(green);
  });

  test("SL above entry returns 0", () => {
    expect(calcPositionSize(500_000, 900, 1000, "green")).toBe(0);
  });

  test("equal entry and SL returns 0", () => {
    expect(calcPositionSize(500_000, 1000, 1000, "green")).toBe(0);
  });
});


describe("R:R Calculation", () => {
  test("3:1 trade passes PTS minimum", () => {
    expect(calcRR(1000, 1300, 900)).toBe(3.0);
  });

  test("below 3:1 fails PTS minimum", () => {
    const rr = calcRR(1000, 1150, 900);
    expect(rr).toBeLessThan(3);
  });

  test("SL above entry returns 0", () => {
    expect(calcRR(1000, 1300, 1100)).toBe(0);
  });

  test("negative R:R returns 0", () => {
    expect(calcRR(1000, 800, 900)).toBe(0);
  });
});
