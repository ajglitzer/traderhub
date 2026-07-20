"use client";

export const TOS_SECTIONS: { title: string; body: string }[] = [
  { title: "1. Acceptance of Terms", body: "By creating an account or using TraderHub, you agree to be bound by these Terms of Service. If you don't agree, don't use the app." },
  { title: "2. What TraderHub Is", body: "TraderHub is a trading journal and analytics tool. It helps you log, review, and analyze your own trading activity. It is not a broker, exchange, or investment platform, and it does not execute real trades." },
  { title: "3. Not Financial Advice", body: "Nothing in TraderHub — journal analytics, AI-generated recaps or analysis, simulator results, community posts, or shared trades from other users — is financial, investment, tax, or legal advice. You are solely responsible for your own trading and investment decisions." },
  { title: "4. Your Account", body: "You're responsible for keeping your login credentials secure and for all activity under your account. Provide accurate information when you sign up. You must be at least 18 years old to use TraderHub." },
  { title: "5. Subscriptions & Billing", body: "TraderHub Pro is a paid subscription (monthly or annual) billed through Stripe. Subscriptions renew automatically until canceled. You can cancel anytime from Settings — your Pro access continues until the end of the billing period you already paid for. Except where required by law, payments are non-refundable." },
  { title: "6. Community Features & Acceptable Use", body: "If you use friending, messaging, or other community features, you agree to TraderHub's Community Guidelines (available in Settings). We may suspend or ban accounts that violate them, harass other users, or misuse the service." },
  { title: "7. Your Content", body: "You keep ownership of the trade data, notes, and messages you create. By sharing content with other users (trade cards, messages, your public profile) you're allowing TraderHub to display that content to the people you shared it with, or publicly, if you choose to make it public." },
  { title: "8. Service \"As Is\"", body: "TraderHub is provided \"as is\" without warranties of any kind. We don't guarantee the app will be error-free, uninterrupted, or that any analytics, AI output, or market data will be accurate. Use it at your own risk." },
  { title: "9. Limitation of Liability", body: "To the fullest extent permitted by law, TraderHub and its operators aren't liable for any trading losses, lost profits, or indirect damages arising from your use of the app." },
  { title: "10. Termination", body: "You can stop using TraderHub and delete your account anytime from Settings. We may suspend or terminate accounts that violate these Terms or the Community Guidelines." },
  { title: "11. Changes", body: "We may update these Terms as the product changes. Continuing to use TraderHub after an update means you accept the revised Terms." },
];

// onDecline omitted => read-only viewing mode (Settings), just a Close button.
export function TosModal({ onAgree, onDecline }: { onAgree: () => void; onDecline?: () => void }) {
  const readOnly = !onDecline;
  return (
    <div style={{ position:"fixed", inset:0, zIndex:100001, background:"rgba(0,0,0,0.92)", backdropFilter:"blur(10px)", display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:"#0e1117", border:"1px solid rgba(255,255,255,0.1)", borderRadius:18, padding:28, width:"100%", maxWidth:520, maxHeight:"85vh", display:"flex", flexDirection:"column" as const }}>
        <div style={{ fontSize:32, marginBottom:8, textAlign:"center" as const }}>📄</div>
        <div style={{ fontSize:18, fontWeight:900, color:"#f0f6fc", marginBottom:4, textAlign:"center" as const }}>Terms of Service</div>
        <div style={{ fontSize:12, color:"#4b5563", marginBottom:16, textAlign:"center" as const, lineHeight:1.6 }}>{readOnly ? "For your reference." : "Please review and accept before continuing."}</div>
        <div style={{ overflowY:"auto" as const, flex:1, marginBottom:18, paddingRight:4 }}>
          <div style={{ display:"flex", flexDirection:"column" as const, gap:14 }}>
            {TOS_SECTIONS.map((s,i)=>(
              <div key={i}>
                <div style={{ fontSize:12.5, fontWeight:700, color:"#00e5ff", marginBottom:3 }}>{s.title}</div>
                <div style={{ fontSize:12, color:"#8b949e", lineHeight:1.65 }}>{s.body}</div>
              </div>
            ))}
          </div>
        </div>
        {readOnly ? (
          <button onClick={onAgree} style={{ padding:"13px", borderRadius:12, border:"1px solid rgba(255,255,255,0.1)", background:"rgba(255,255,255,0.04)", color:"#d1d5db", cursor:"pointer", fontSize:13, fontWeight:700 }}>
            Close
          </button>
        ) : (
          <div style={{ display:"flex", gap:10 }}>
            <button onClick={onDecline} style={{ flex:1, padding:"13px", borderRadius:12, border:"1px solid rgba(255,255,255,0.1)", background:"rgba(255,255,255,0.04)", color:"#6b7280", cursor:"pointer", fontSize:13, fontWeight:700 }}>
              Decline & Sign Out
            </button>
            <button onClick={onAgree} style={{ flex:1, padding:"13px", borderRadius:12, border:"none", background:"linear-gradient(135deg,#00e5ff,#0088bb)", color:"#000", cursor:"pointer", fontSize:13, fontWeight:800 }}>
              I Agree
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
