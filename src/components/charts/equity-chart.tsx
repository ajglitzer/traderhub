"use client";
import { EquityPoint } from "@/types/trade";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { format } from "date-fns";

const CustomTip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as EquityPoint;
  const pos = d.equity >= 0;
  const fmt = (n: number) => (n >= 0 ? "+" : "") + "$" + Math.abs(n).toLocaleString("en-US", {minimumFractionDigits:2,maximumFractionDigits:2});
  return (
    <div style={{ background:"rgba(6,10,15,0.97)", border:"1px solid rgba(0,229,255,0.2)", borderRadius:10, padding:"10px 14px", boxShadow:"0 8px 32px rgba(0,0,0,0.6)" }}>
      <div style={{ fontSize:10, color:"#4b5563", marginBottom:4 }}>{format(new Date(d.date), "MMM d, yyyy")}</div>
      <div style={{ fontSize:18, fontWeight:800, fontFamily:"monospace", color: pos ? "#00e676" : "#ff1744", letterSpacing:"-0.03em" }}>{fmt(d.equity)}</div>
      <div style={{ fontSize:11, fontFamily:"monospace", color: d.pnl >= 0 ? "#00e676" : "#ff1744", marginTop:3 }}>
        {d.pnl >= 0 ? "▲" : "▼"} {fmt(Math.abs(d.pnl))} this trade
      </div>
      {d.drawdown > 0 && <div style={{ fontSize:10, color:"#ff1744", marginTop:2 }}>DD: {d.drawdownPct.toFixed(1)}%</div>}
    </div>
  );
};

export function EquityChart({ data, height = 260 }: { data: EquityPoint[]; height?: number }) {
  if (!data.length) return (
    <div style={{ height, display:"flex", alignItems:"center", justifyContent:"center", color:"#3d4551", fontSize:13 }}>
      Import trades to see your equity curve
    </div>
  );
  const last = data[data.length - 1];
  const isPos = last.equity >= 0;
  const color = isPos ? "#00e676" : "#ff1744";
  const colorDim = isPos ? "rgba(0,230,118,0.6)" : "rgba(255,23,68,0.6)";
  const id = isPos ? "eqGreen" : "eqRed";

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top:8, right:4, left:0, bottom:0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3}/>
            <stop offset="50%" stopColor={color} stopOpacity={0.08}/>
            <stop offset="100%" stopColor={color} stopOpacity={0}/>
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        <CartesianGrid strokeDasharray="1 6" stroke="rgba(255,255,255,0.03)" vertical={false}/>
        <XAxis dataKey="date" tickFormatter={v => format(new Date(v), "MMM d")} tick={{ fontSize:10, fill:"#3d4551" }} axisLine={false} tickLine={false} interval="preserveStartEnd"/>
        <YAxis tickFormatter={v => v >= 1000 ? `$${(v/1000).toFixed(0)}k` : `$${v.toFixed(0)}`} tick={{ fontSize:10, fill:"#3d4551" }} axisLine={false} tickLine={false} width={54}/>
        <ReferenceLine y={0} stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4"/>
        <Tooltip content={<CustomTip/>}/>
        <Area type="monotone" dataKey="equity"
          stroke={color} strokeWidth={2.5}
          fill={`url(#${id})`} dot={false}
          activeDot={{ r:6, fill:color, stroke:"rgba(0,0,0,0.6)", strokeWidth:2, filter:"url(#glow)" }}
          style={{ filter:"drop-shadow(0 0 4px " + colorDim + ")" }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
