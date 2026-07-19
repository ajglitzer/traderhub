import { detectAssetClass, resolveAssetClass, specRootSymbol, getRootSymbol, getFilteredTrades } from "./__built__/utils.mjs";
let pass=0, fail=0;
const t=(n,f)=>{try{f();console.log(`  PASS  ${n}`);pass++;}catch(e){console.log(`  FAIL  ${n}\n        ${e.message}`);fail++;}};
const is=(a,b,m="")=>{if(a!==b)throw new Error(`${m} got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`);};

console.log("\n--- Gold / metals classified as FUTURES ---");
t("gold in every symbol format", () => {
  for (const s of ["GC","GC1!","COMEX:GC1!","GCZ24","GCZ2024","MGC","MGC1!","COMEX_MINI:MGC1!","MGCZ24"])
    is(detectAssetClass(s),"FUTURES",`${s}:`);
});
t("silver/copper/platinum/palladium", () => {
  for (const s of ["SI1!","SIL1!","MSI1!","HG1!","MHG1!","PL1!","PA1!"]) is(detectAssetClass(s),"FUTURES",`${s}:`);
});
t("gold ETF GLD stays STOCK (not futures)", () => is(detectAssetClass("GLD"),"STOCK"));
t("XAUUSD spot gold is FOREX not futures", () => is(detectAssetClass("XAUUSD"),"FOREX"));

console.log("\n--- Index / energy / rates / FX futures ---");
t("index futures", () => { for(const s of ["ES1!","MES1!","NQ1!","MNQ1!","YM1!","MYM1!","RTY1!","M2K1!"]) is(detectAssetClass(s),"FUTURES",`${s}:`); });
t("energy futures", () => { for(const s of ["CL1!","MCL1!","NG1!","QG1!","HO1!","RB1!","BZ1!"]) is(detectAssetClass(s),"FUTURES",`${s}:`); });
t("treasury futures", () => { for(const s of ["ZN1!","ZB1!","ZF1!","ZT1!","UB1!"]) is(detectAssetClass(s),"FUTURES",`${s}:`); });
t("currency futures", () => { for(const s of ["6E1!","6J1!","6B1!","6A1!"]) is(detectAssetClass(s),"FUTURES",`${s}:`); });

console.log("\n--- Stocks/crypto not swept into futures ---");
t("common stocks stay STOCK", () => { for(const s of ["AAPL","TSLA","SPY","QQQ","NVDA","AMD","MSFT"]) is(detectAssetClass(s),"STOCK",`${s}:`); });
t("crypto detected", () => { for(const s of ["BTCUSDT","ETHUSD"]) is(detectAssetClass(s),"CRYPTO",`${s}:`); });
t("fx pairs detected", () => { for(const s of ["EURUSD","GBPJPY","AUDCAD"]) is(detectAssetClass(s),"FOREX",`${s}:`); });

console.log("\n--- Spec root keeps digits (P&L multiplier lookup) ---");
t("numeric roots survive normalization", () => {
  is(specRootSymbol("6E1!"),"6E"); is(specRootSymbol("6J1!"),"6J");
  is(specRootSymbol("M2K1!"),"M2K"); is(specRootSymbol("MGC1!"),"MGC");
  is(specRootSymbol("COMEX_MINI:MGC1!"),"MGC");
});

console.log("\n--- Repair of legacy/incorrect data ---");
t("gold saved as STOCK is corrected to FUTURES", () =>
  is(resolveAssetClass({ticker:"MGC1!", assetClass:"STOCK"}),"FUTURES"));
t("missing assetClass inferred from ticker", () =>
  is(resolveAssetClass({ticker:"GC1!"}),"FUTURES"));
t("real stock is left alone", () =>
  is(resolveAssetClass({ticker:"AAPL", assetClass:"STOCK"}),"STOCK"));
t("deliberate OPTIONS on a stock ticker is respected", () =>
  is(resolveAssetClass({ticker:"AAPL", assetClass:"OPTIONS"}),"OPTIONS"));
t("XAUUSD saved as STOCK is corrected to FOREX", () =>
  is(resolveAssetClass({ticker:"XAUUSD", assetClass:"STOCK"}),"FOREX"));
t("BTCUSDT saved as STOCK is corrected to CRYPTO", () =>
  is(resolveAssetClass({ticker:"BTCUSDT", assetClass:"STOCK"}),"CRYPTO"));

console.log("\n--- Filtering: futures vs stocks ---");
const T=(o)=>({status:"CLOSED",side:"LONG",entryTime:"2026-01-05T10:00:00.000Z",netPnl:0,tags:[],...o});
t("FUTURES filter returns gold, excludes stocks", () => {
  const d=[T({ticker:"MGC1!",assetClass:"FUTURES"}),T({ticker:"GC1!",assetClass:"FUTURES"}),
           T({ticker:"AAPL",assetClass:"STOCK"}),T({ticker:"GLD",assetClass:"STOCK"})];
  const r=getFilteredTrades(d,{assetClass:"FUTURES"},1,50);
  is(r.total,2,"futures count:");
  is(r.trades.every(x=>x.assetClass==="FUTURES"),true);
});
t("STOCK filter excludes all futures", () => {
  const d=[T({ticker:"MGC1!",assetClass:"FUTURES"}),T({ticker:"AAPL",assetClass:"STOCK"}),T({ticker:"GLD",assetClass:"STOCK"})];
  const r=getFilteredTrades(d,{assetClass:"STOCK"},1,50);
  is(r.total,2); is(r.trades.some(x=>x.ticker==="MGC1!"),false,"gold must not appear under stocks");
});

console.log(`\n${"=".repeat(46)}\n  ${pass} passed, ${fail} failed\n${"=".repeat(46)}\n`);
process.exit(fail?1:0);
