// Regression tests for trade log sorting/filtering.
// Run: node tests/sorting.test.mjs   (bundles the real src/lib/utils.ts first)
import { getFilteredTrades, compareTrades } from "./__built__/utils.mjs";

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log(`  PASS  ${name}`); pass++; }
  catch (e) { console.log(`  FAIL  ${name}\n        ${e.message}`); fail++; }
};
const eq = (a, b, m="") => {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) throw new Error(`${m}\n        got:      ${A}\n        expected: ${B}`);
};

const T = (o={}) => ({
  id: o.ticker ?? Math.random().toString(36).slice(2),
  status:"CLOSED", side:"LONG", assetClass:"FUTURES", ticker:"NQ1!",
  entryTime:"2026-01-05T10:00:00.000Z", exitTime:"2026-01-05T11:00:00.000Z",
  entryPrice:100, exitPrice:110, quantity:1,
  netPnl:0, grossPnl:0, rMultiple:0, holdTimeSeconds:60, tags:[], ...o,
});
const order = (trades, filters) => getFilteredTrades(trades, filters, 1, 500).trades.map(x => x.ticker);

console.log("\n--- Numeric sorting ---");
t("netPnl desc", () => {
  const d = [T({ticker:"a",netPnl:50}),T({ticker:"b",netPnl:500}),T({ticker:"c",netPnl:-300})];
  eq(order(d,{sortBy:"netPnl",sortDir:"desc"}), ["b","a","c"]);
});
t("netPnl asc", () => {
  const d = [T({ticker:"a",netPnl:50}),T({ticker:"b",netPnl:500}),T({ticker:"c",netPnl:-300})];
  eq(order(d,{sortBy:"netPnl",sortDir:"asc"}), ["c","a","b"]);
});
t("numeric strings sort numerically not lexically", () => {
  const d = [T({ticker:"a",netPnl:"1000"}),T({ticker:"b",netPnl:"9"}),T({ticker:"c",netPnl:"250"})];
  eq(order(d,{sortBy:"netPnl",sortDir:"desc"}), ["a","c","b"]);
});
t("quantity + rMultiple + holdTimeSeconds sort numerically", () => {
  for (const col of ["quantity","rMultiple","holdTimeSeconds"]) {
    const d = [T({ticker:"lo",[col]:1}),T({ticker:"hi",[col]:99}),T({ticker:"mid",[col]:10})];
    eq(order(d,{sortBy:col,sortDir:"desc"}), ["hi","mid","lo"], `col=${col}`);
  }
});

console.log("\n--- Date sorting ---");
t("entryTime desc = newest first", () => {
  const d = [
    T({ticker:"old", entryTime:"2026-01-01T10:00:00.000Z"}),
    T({ticker:"new", entryTime:"2026-03-01T10:00:00.000Z"}),
    T({ticker:"mid", entryTime:"2026-02-01T10:00:00.000Z"}),
  ];
  eq(order(d,{sortBy:"entryTime",sortDir:"desc"}), ["new","mid","old"]);
});
t("mixed date formats still chronological", () => {
  const d = [
    T({ticker:"noon", entryTime:"2026-01-05T12:00"}),
    T({ticker:"9am",  entryTime:"2026-01-05T09:00:00.000Z"}),
    T({ticker:"3pm",  entryTime:"2026-01-05T15:00:00.000Z"}),
  ];
  const got = order(d,{sortBy:"entryTime",sortDir:"asc"});
  eq(got[0],"9am","earliest first"); eq(got[2],"3pm","latest last");
});

console.log("\n--- String sorting ---");
t("ticker asc alphabetical", () => {
  const d = ["TSLA","AAPL","MSFT"].map(x=>T({ticker:x}));
  eq(order(d,{sortBy:"ticker",sortDir:"asc"}), ["AAPL","MSFT","TSLA"]);
});
t("ticker desc reverses", () => {
  const d = ["TSLA","AAPL","MSFT"].map(x=>T({ticker:x}));
  eq(order(d,{sortBy:"ticker",sortDir:"desc"}), ["TSLA","MSFT","AAPL"]);
});

console.log("\n--- Null / OPEN trade handling ---");
t("null netPnl sorts LAST in desc", () => {
  const d = [T({ticker:"open",netPnl:null,status:"OPEN"}),T({ticker:"win",netPnl:500}),T({ticker:"loss",netPnl:-300})];
  eq(order(d,{sortBy:"netPnl",sortDir:"desc"}), ["win","loss","open"]);
});
t("null netPnl sorts LAST in asc too (never treated as 0)", () => {
  const d = [T({ticker:"open",netPnl:null,status:"OPEN"}),T({ticker:"win",netPnl:500}),T({ticker:"loss",netPnl:-300})];
  eq(order(d,{sortBy:"netPnl",sortDir:"asc"}), ["loss","win","open"]);
});
t("null exitTime (open trade) sorts last", () => {
  const d = [T({ticker:"open",exitTime:null}),T({ticker:"closed",exitTime:"2026-01-05T11:00:00.000Z"})];
  eq(order(d,{sortBy:"exitTime",sortDir:"desc"}), ["closed","open"]);
});

console.log("\n--- Stability ---");
t("equal values keep original order", () => {
  const d = [T({ticker:"A",netPnl:100}),T({ticker:"B",netPnl:100}),T({ticker:"C",netPnl:100})];
  eq(order(d,{sortBy:"netPnl",sortDir:"desc"}), ["A","B","C"]);
});
t("stable across repeated sorts (no shuffle on re-render)", () => {
  const d = Array.from({length:60},(_,i)=>T({ticker:`t${i}`, netPnl: i%3===0?100:50}));
  const a = order(d,{sortBy:"netPnl",sortDir:"desc"});
  const b = order(d,{sortBy:"netPnl",sortDir:"desc"});
  eq(a,b,"two identical sorts must match");
});

console.log("\n--- Comparator contract ---");
t("cmp(a,b) === -cmp(b,a) and 0 for equals", () => {
  const A = T({netPnl:100}), B = T({netPnl:100}), C = T({netPnl:5});
  if (compareTrades(A,B,"netPnl","desc") !== 0) throw new Error("equal must return 0");
  const ab = compareTrades(A,C,"netPnl","desc"), ba = compareTrades(C,A,"netPnl","desc");
  if (ab !== -ba) throw new Error(`asymmetric: ${ab} vs ${ba}`);
});

console.log("\n--- Filtering ---");
t("assetClass filter actually filters", () => {
  const d = [T({ticker:"nq",assetClass:"FUTURES"}),T({ticker:"aapl",assetClass:"STOCK"})];
  eq(order(d,{assetClass:"STOCK"}), ["aapl"]);
});
t("legacy assetType filter key still honored", () => {
  const d = [T({ticker:"nq",assetClass:"FUTURES"}),T({ticker:"aapl",assetClass:"STOCK"})];
  eq(order(d,{assetType:"STOCK"}), ["aapl"]);
});
t("status + side filters", () => {
  const d = [T({ticker:"a",status:"OPEN",side:"LONG"}),T({ticker:"b",status:"CLOSED",side:"LONG"}),T({ticker:"c",status:"CLOSED",side:"SHORT"})];
  eq(order(d,{status:"CLOSED"}), ["b","c"]);
  eq(order(d,{status:"CLOSED",side:"SHORT"}), ["c"]);
});
t("date range filter", () => {
  const d = [
    T({ticker:"jan", entryTime:"2026-01-15T10:00:00.000Z"}),
    T({ticker:"feb", entryTime:"2026-02-15T10:00:00.000Z"}),
    T({ticker:"mar", entryTime:"2026-03-15T10:00:00.000Z"}),
  ];
  eq(order(d,{dateFrom:"2026-02-01",dateTo:"2026-02-28",sortBy:"entryTime",sortDir:"asc"}), ["feb"]);
});
t("ticker search is case-insensitive substring", () => {
  const d = [T({ticker:"NQ1!"}),T({ticker:"AAPL"})];
  eq(order(d,{ticker:"nq"}), ["NQ1!"]);
});

console.log("\n--- Pagination ---");
t("page size and totals", () => {
  const d = Array.from({length:120},(_,i)=>T({ticker:`t${i}`,netPnl:i}));
  const r = getFilteredTrades(d,{sortBy:"netPnl",sortDir:"desc"},1,50);
  eq(r.trades.length,50,"page 1 size"); eq(r.total,120); eq(r.totalPages,3);
});
t("pages do not overlap and cover everything", () => {
  const d = Array.from({length:120},(_,i)=>T({ticker:`t${i}`,netPnl:i}));
  const seen = [];
  for (let p=1;p<=3;p++) seen.push(...getFilteredTrades(d,{sortBy:"netPnl",sortDir:"desc"},p,50).trades.map(x=>x.ticker));
  eq(seen.length,120); eq(new Set(seen).size,120,"no duplicates across pages");
});
t("out-of-range page clamps to last page", () => {
  const d = Array.from({length:60},(_,i)=>T({ticker:`t${i}`}));
  eq(getFilteredTrades(d,{},99,50).trades.length,10);
});

console.log("\n--- Malformed data ---");
t("handles non-array input", () => { eq(getFilteredTrades(null,{},1).total,0); });
t("handles null entries and missing fields", () => {
  const d = [null,T({ticker:"ok"}),{ticker:"bare"},undefined];
  const r = getFilteredTrades(d,{sortBy:"netPnl",sortDir:"desc"},1,50);
  if (r.total !== 2) throw new Error(`expected 2 real rows, got ${r.total}`);
});
t("unknown sort column does not crash", () => {
  const d = [T({ticker:"a"}),T({ticker:"b"})];
  eq(getFilteredTrades(d,{sortBy:"nope",sortDir:"desc"},1,50).total,2);
});

console.log(`\n${"=".repeat(46)}\n  ${pass} passed, ${fail} failed\n${"=".repeat(46)}\n`);
process.exit(fail ? 1 : 0);
