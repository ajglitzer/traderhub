export default function NotFound() {
  return (
    <html><head><title>Profile Not Found · TraderHub</title>
      <meta name="viewport" content="width=device-width,initial-scale=1"/>
      <style>{`body{margin:0;font-family:monospace;background:#060a0f;color:#f0f6fc;min-height:100vh;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:16px}`}</style>
    </head><body>
      <div style={{fontSize:48}}>🔍</div>
      <div style={{fontSize:20,fontWeight:900}}>Profile Not Found</div>
      <div style={{fontSize:13,color:"#4b5563"}}>This trader doesn&apos;t exist or hasn&apos;t set up their profile yet.</div>
      <a href="https://traderhub-nine.vercel.app" style={{padding:"10px 24px",borderRadius:10,background:"linear-gradient(135deg,#00e5ff,#0088bb)",color:"#000",fontSize:13,fontWeight:800,textDecoration:"none",marginTop:8}}>Go to TraderHub -</a>
    </body></html>
  );
}
