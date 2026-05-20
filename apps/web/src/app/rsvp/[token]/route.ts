import { ensureInvitationMessage, repairLegacyInvitations } from "@/lib/domain";
import { loadState, saveStateStrict } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const state = await loadState({ fresh: true });
  const hadMessage = state.campaign.messages.some((item) => item.token === token);
  const repaired = repairLegacyInvitations(state);
  const message = ensureInvitationMessage(state, token);

  if (!message) {
    return new Response(notFoundPage(), {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
  if (!hadMessage || repaired) await saveStateStrict(state);

  const contact = state.campaign.contacts.find((item) => item.id === message.contactId);
  const guestName = message.recipientName || contact?.name || "Guest";
  const currentRsvp = message.rsvp || "";
  const requestUrl = new URL(request.url);
  const origin = requestUrl.origin;
  const autoResponse = requestUrl.searchParams.get("response")?.toUpperCase() || "";
  const hasMedia = state.templates?.some((t) => t.mediaData && t.mediaMimeType);
  const ogImage = hasMedia ? `${origin}/api/media/invitation` : "";

  return new Response(landingPage({ token, guestName, currentRsvp, ogImage, autoResponse }), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function notFoundPage() {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Not Found</title>
<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400..800;1,400..800&family=Manrope:wght@200..800&display=swap" rel="stylesheet">
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Manrope,sans-serif;background:#f7fbec;color:#181d14;min-height:100vh;display:grid;place-items:center;padding:20px}.card{text-align:center;max-width:400px}h1{font-family:'EB Garamond',serif;font-size:32px;color:#4a654a;margin-bottom:12px}p{color:#5f5f59;font-size:16px;line-height:28px}</style>
</head><body><div class="card"><h1>Link not found</h1><p>Sorry, this invitation link is not valid.</p></div></body></html>`;
}

function landingPage(data: { token: string; guestName: string; currentRsvp: string; ogImage: string; autoResponse: string }) {
  const { token, guestName, currentRsvp, ogImage, autoResponse } = data;
  const escapedName = guestName.replace(/</g, "&lt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title>Hamza &amp; Shouq — Wedding Invitation</title>
<meta property="og:title" content="Hamza &amp; Shouq Wedding — You're Invited!">
<meta property="og:description" content="Dear ${escapedName}, you are invited to the wedding of Hamza &amp; Shouq — Friday, 03 July 2026">
<meta property="og:type" content="website">
${ogImage ? `<meta property="og:image" content="${ogImage}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${ogImage}">` : ""}
<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400..800;1,400..800&family=Manrope:wght@200..800&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet">
<style>
@font-face{font-family:'Alhanoof';src:url('/fonts/Alharbi-Alhanoof.otf') format('opentype');font-weight:400;font-style:normal;font-display:swap}
*{margin:0;padding:0;box-sizing:border-box}
html,body{height:100%;overflow:hidden}
body{font-family:Manrope,sans-serif;background:#f7fbec;color:#181d14}

/* ---- Full-screen BG ---- */
.bg{position:fixed;inset:0;z-index:0;overflow:hidden}
.bg svg{position:absolute;opacity:.18}
.bg .tl{top:-5%;left:-5%;width:45%;height:55%}
.bg .tr{top:-5%;right:-5%;width:45%;height:55%;transform:scaleX(-1)}
.bg .bl{bottom:-5%;left:-5%;width:40%;height:45%;transform:scaleY(-1)}
.bg .br{bottom:-5%;right:-5%;width:40%;height:45%;transform:scale(-1)}

/* ---- Layout: fill viewport, no scroll ---- */
.page{position:relative;z-index:1;height:100vh;height:100dvh;display:flex;align-items:center;justify-content:center;padding:12px}
.card{width:100%;max-width:400px;display:flex;flex-direction:column;align-items:center;gap:clamp(10px,2vh,20px)}

/* ---- Typography ---- */
.lbl{font-size:10px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#4a654a}
.serif{font-family:'EB Garamond',serif;font-weight:400}
.sub{color:#5f5f59;font-style:italic;font-size:13px}
.mat{font-family:'Material Symbols Outlined';font-size:16px;color:#4a654a}

/* ---- Header ---- */
header{text-align:center;display:flex;flex-direction:column;align-items:center;gap:4px}
header h1{font-size:clamp(28px,5vw,42px);line-height:1.15;color:#243d25}
header h1 em{font-style:italic;font-weight:300}

/* ---- Divider ---- */
.div-line{display:flex;align-items:center;gap:10px;width:140px}
.div-line i{height:1px;flex:1;background:#c3c8bf}
.div-line .mat{font-variation-settings:'FILL' 1;font-size:14px;opacity:.7}

/* ---- Guest ---- */
.guest{text-align:center}
.guest .name{font-family:'Alhanoof','EB Garamond',serif;font-size:clamp(22px,4vw,32px);color:#243d25;direction:auto;line-height:1.4}

/* ---- Glass info card ---- */
.info{background:rgba(247,251,236,.55);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.25);border-radius:16px;padding:16px 20px;width:100%;text-align:center;display:flex;flex-direction:column;gap:10px}
.info .row-label{display:flex;align-items:center;justify-content:center;gap:5px}
.info .val{font-size:clamp(17px,2.5vw,21px);color:#243d25;line-height:1.25;margin-top:2px}
.info .val-sub{font-size:clamp(14px,2vw,17px);color:#5f5f59}
.sep{width:36px;height:1px;background:rgba(195,200,191,.35);margin:0 auto}

/* ---- Countdown ---- */
.cd{display:flex;align-items:center;justify-content:center;gap:clamp(10px,3vw,20px)}
.cd-u{text-align:center}
.cd-u .n{font-size:clamp(26px,4.5vw,38px);color:#4a654a;line-height:1}
.cd-u .l{font-size:9px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#5f5f59;margin-top:2px}
.cd-s{font-size:clamp(22px,4vw,34px);color:rgba(195,200,191,.5);padding-bottom:12px}

/* ---- RSVP ---- */
.rsvp{width:100%;display:flex;flex-direction:column;align-items:center;gap:10px}
.rsvp .prompt{font-size:13px;color:#434841}
.rsvp-btns{display:flex;gap:10px;width:100%}
.rsvp-btn{flex:1;padding:12px 10px;border-radius:12px;border:none;cursor:pointer;font-family:Manrope,sans-serif;font-weight:600;font-size:13px;letter-spacing:.04em;display:flex;align-items:center;justify-content:center;gap:6px;transition:all .2s}
.rsvp-btn .mat{font-size:18px}
.rsvp-btn.yes{background:#4a654a;color:#fff}
.rsvp-btn.yes:hover{background:#3a553a}
.rsvp-btn.no{background:transparent;border:1px solid #c09d25;color:#453600}
.rsvp-btn.no:hover{background:rgba(192,157,37,.08)}
.rsvp-btn.active{transform:scale(1.03);box-shadow:0 3px 12px rgba(74,101,74,.18)}
.rsvp-btn.yes.active{background:#334d34}
.rsvp-btn.no.active{background:rgba(192,157,37,.1);border-color:#735c00}
.rsvp-btn:disabled{opacity:.55;cursor:not-allowed;transform:none}
.badge{display:inline-flex;align-items:center;gap:5px;padding:8px 16px;border-radius:20px;font-weight:600;font-size:13px}
.badge.y{background:#ecfdf5;color:#065f46;border:1px solid #a7f3d0}
.badge.n{background:#fef2f2;color:#991b1b;border:1px solid #fecaca}

/* ---- Action row ---- */
.acts{display:grid;grid-template-columns:1fr 1fr;gap:8px;width:100%}
.act{flex:1;padding:10px 8px;border-radius:10px;border:none;cursor:pointer;font-family:Manrope,sans-serif;font-weight:600;font-size:11px;letter-spacing:.06em;text-transform:uppercase;display:flex;align-items:center;justify-content:center;gap:6px;text-decoration:none;transition:all .15s}
.act .mat{font-size:18px}
.act.p{background:#4a654a;color:#fff}.act.p:hover{opacity:.88}
.act.s{background:rgba(255,255,255,.45);border:1px solid #c09d25;color:#453600}.act.s:hover{background:rgba(255,255,255,.7)}
.act.o{background:transparent;border:1px solid #c3c8bf;color:#5f5f59}.act.o:hover{background:rgba(224,228,214,.25)}

/* ---- Footer ---- */
.foot{font-size:11px;color:#9ca3af;text-align:center}

/* ---- Toast ---- */
.toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%) translateY(60px);background:#334d34;color:#fff;padding:12px 20px;border-radius:12px;font-size:13px;font-weight:500;opacity:0;transition:all .35s;z-index:50;pointer-events:none;white-space:nowrap}
.toast.show{opacity:1;transform:translateX(-50%) translateY(0)}

/* ---- Animations ---- */
@keyframes up{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
.fi{animation:up .5s ease-out both}
.d1{animation-delay:.05s}.d2{animation-delay:.1s}.d3{animation-delay:.15s}
.d4{animation-delay:.2s}.d5{animation-delay:.25s}.d6{animation-delay:.3s}.d7{animation-delay:.35s}

/* ---- Desktop ---- */
@media(min-width:700px){
  .card{max-width:440px;gap:clamp(14px,2.2vh,24px)}
  header h1{font-size:48px}
  .guest .name{font-size:30px}
  .info{padding:20px 28px;gap:12px}
  .rsvp-btn{padding:14px 12px;font-size:14px}
  .act{padding:12px 10px;font-size:12px}
}

/* ---- Very short screens ---- */
@media(max-height:680px){
  .card{gap:6px}
  .info{padding:12px 16px;gap:6px}
  .cd-u .n{font-size:24px}
  .rsvp-btn{padding:10px 8px}
  .acts{gap:6px}
  .act{padding:8px 6px;font-size:10px}
}
</style>
</head>
<body>

<!-- Botanical corners via inline SVG so it's always crisp -->
<div class="bg">
  <svg class="tl" viewBox="0 0 500 600" fill="none" xmlns="http://www.w3.org/2000/svg">
    <g opacity=".9">
      <ellipse cx="120" cy="80" rx="60" ry="28" fill="#b0ceae" transform="rotate(-30 120 80)"/>
      <ellipse cx="90" cy="140" rx="52" ry="24" fill="#8ba889" transform="rotate(-45 90 140)"/>
      <ellipse cx="150" cy="180" rx="58" ry="26" fill="#ccebc8" transform="rotate(-20 150 180)"/>
      <ellipse cx="70" cy="240" rx="48" ry="22" fill="#b0ceae" transform="rotate(-55 70 240)"/>
      <ellipse cx="130" cy="290" rx="54" ry="25" fill="#8ba889" transform="rotate(-35 130 290)"/>
      <ellipse cx="60" cy="350" rx="45" ry="20" fill="#ccebc8" transform="rotate(-50 60 350)"/>
      <ellipse cx="100" cy="400" rx="50" ry="23" fill="#b0ceae" transform="rotate(-40 100 400)"/>
      <ellipse cx="140" cy="120" rx="42" ry="19" fill="#e0e4d6" transform="rotate(-25 140 120)"/>
      <ellipse cx="50" cy="180" rx="38" ry="17" fill="#d7dccd" transform="rotate(-60 50 180)"/>
      <ellipse cx="110" cy="340" rx="44" ry="20" fill="#e5eadb" transform="rotate(-30 110 340)"/>
      <path d="M100 0 Q95 200 60 420" stroke="#8ba889" stroke-width="2.5" fill="none" opacity=".5"/>
      <path d="M130 0 Q120 180 80 380" stroke="#b0ceae" stroke-width="2" fill="none" opacity=".4"/>
    </g>
  </svg>
  <svg class="tr" viewBox="0 0 500 600" fill="none" xmlns="http://www.w3.org/2000/svg">
    <g opacity=".9">
      <ellipse cx="120" cy="80" rx="60" ry="28" fill="#b0ceae" transform="rotate(-30 120 80)"/>
      <ellipse cx="90" cy="140" rx="52" ry="24" fill="#8ba889" transform="rotate(-45 90 140)"/>
      <ellipse cx="150" cy="180" rx="58" ry="26" fill="#ccebc8" transform="rotate(-20 150 180)"/>
      <ellipse cx="70" cy="240" rx="48" ry="22" fill="#b0ceae" transform="rotate(-55 70 240)"/>
      <ellipse cx="130" cy="290" rx="54" ry="25" fill="#8ba889" transform="rotate(-35 130 290)"/>
      <ellipse cx="60" cy="350" rx="45" ry="20" fill="#ccebc8" transform="rotate(-50 60 350)"/>
      <ellipse cx="100" cy="400" rx="50" ry="23" fill="#b0ceae" transform="rotate(-40 100 400)"/>
      <path d="M100 0 Q95 200 60 420" stroke="#8ba889" stroke-width="2.5" fill="none" opacity=".5"/>
      <path d="M130 0 Q120 180 80 380" stroke="#b0ceae" stroke-width="2" fill="none" opacity=".4"/>
    </g>
  </svg>
  <svg class="bl" viewBox="0 0 500 600" fill="none" xmlns="http://www.w3.org/2000/svg">
    <g opacity=".7">
      <ellipse cx="110" cy="100" rx="55" ry="25" fill="#b0ceae" transform="rotate(-35 110 100)"/>
      <ellipse cx="80" cy="160" rx="48" ry="22" fill="#8ba889" transform="rotate(-50 80 160)"/>
      <ellipse cx="140" cy="200" rx="52" ry="24" fill="#ccebc8" transform="rotate(-25 140 200)"/>
      <ellipse cx="60" cy="260" rx="44" ry="20" fill="#b0ceae" transform="rotate(-55 60 260)"/>
      <path d="M90 0 Q85 180 55 380" stroke="#8ba889" stroke-width="2" fill="none" opacity=".45"/>
    </g>
  </svg>
  <svg class="br" viewBox="0 0 500 600" fill="none" xmlns="http://www.w3.org/2000/svg">
    <g opacity=".7">
      <ellipse cx="110" cy="100" rx="55" ry="25" fill="#b0ceae" transform="rotate(-35 110 100)"/>
      <ellipse cx="80" cy="160" rx="48" ry="22" fill="#8ba889" transform="rotate(-50 80 160)"/>
      <ellipse cx="140" cy="200" rx="52" ry="24" fill="#ccebc8" transform="rotate(-25 140 200)"/>
      <ellipse cx="60" cy="260" rx="44" ry="20" fill="#b0ceae" transform="rotate(-55 60 260)"/>
      <path d="M90 0 Q85 180 55 380" stroke="#8ba889" stroke-width="2" fill="none" opacity=".45"/>
    </g>
  </svg>
</div>

<div class="page">
<div class="card">

  <header class="fi">
    <span class="lbl">Our Beloved Friends &amp; Family</span>
    <h1 class="serif">Hamza <em>&amp;</em> Shouq</h1>
    <p class="sub">Invite you to their wedding ceremony</p>
  </header>

  <div class="div-line fi d1"><i></i><span class="mat" style="font-variation-settings:'FILL' 1">local_florist</span><i></i></div>

  <div class="guest fi d2">
    <span class="sub" style="font-style:normal;font-size:12px;letter-spacing:.04em">Dear</span>
    <div class="name serif">${escapedName}</div>
  </div>

  <section class="info fi d3">
    <div>
      <div class="row-label"><span class="mat">calendar_month</span><span class="lbl">When</span></div>
      <p class="val serif">Friday, 03 July</p>
      <p class="val-sub serif">20:00 GMT+3</p>
    </div>
    <div class="sep"></div>
    <div>
      <div class="row-label"><span class="mat">location_on</span><span class="lbl">Where</span></div>
      <p class="val serif">Diwan Al-Haj Hassan</p>
      <p class="val-sub serif">Amman, Jordan</p>
    </div>
  </section>

  <section class="cd fi d4">
    <div class="cd-u"><span class="n serif" id="cd-d">--</span><span class="l">Days</span></div>
    <span class="cd-s serif">:</span>
    <div class="cd-u"><span class="n serif" id="cd-h">--</span><span class="l">Hrs</span></div>
    <span class="cd-s serif">:</span>
    <div class="cd-u"><span class="n serif" id="cd-m">--</span><span class="l">Min</span></div>
    <span class="cd-s serif">:</span>
    <div class="cd-u"><span class="n serif" id="cd-s">--</span><span class="l">Sec</span></div>
  </section>

  <section class="rsvp fi d5" id="rsvp">
    <div id="rsvp-badge" style="${currentRsvp ? "" : "display:none"}">
      <span class="badge ${currentRsvp === "YES" ? "y" : currentRsvp === "NO" ? "n" : ""}">
        ${currentRsvp === "YES" ? "&#10003; Attending — See you there!" : currentRsvp === "NO" ? "&#10007; We'll miss you!" : ""}
      </span>
    </div>
    <p class="prompt" id="prompt">${currentRsvp ? "Change your response:" : "Will you be joining us?"}</p>
    <div class="rsvp-btns">
      <button class="rsvp-btn yes${currentRsvp === "YES" ? " active" : ""}" id="by" onclick="rsvp('YES')">
        <span class="mat">celebration</span> Attending
      </button>
      <button class="rsvp-btn no${currentRsvp === "NO" ? " active" : ""}" id="bn" onclick="rsvp('NO')">
        <span class="mat">event_busy</span> Decline
      </button>
    </div>
  </section>

  <nav class="acts fi d6">
    <a class="act p" href="https://maps.app.goo.gl/9zhpcxXZW9iChtLR7" target="_blank" rel="noopener">
      <span class="mat">map</span> Location
    </a>
    <a class="act s" href="https://wa.me/00962795941263" target="_blank" rel="noopener">
      <span class="mat">chat</span> WhatsApp
    </a>
    <a class="act o" href="tel:+962795941263">
      <span class="mat">call</span> Call
    </a>
    <a class="act o" href="mailto:info@hamzaandshouq.com">
      <span class="mat">mail</span> Email
    </a>
  </nav>

  <p class="foot fi d7">Hamza &amp; Shouq &hearts;</p>

</div>
</div>

<div class="toast" id="toast"></div>

<script>
var W=new Date("2026-07-03T17:00:00Z");
function tick(){var d=Math.max(0,W-new Date()),D=d/864e5|0,H=d%864e5/36e5|0,M=d%36e5/6e4|0,S=d%6e4/1e3|0;
document.getElementById("cd-d").textContent=String(D).padStart(2,"0");
document.getElementById("cd-h").textContent=String(H).padStart(2,"0");
document.getElementById("cd-m").textContent=String(M).padStart(2,"0");
document.getElementById("cd-s").textContent=String(S).padStart(2,"0")}
tick();setInterval(tick,1000);

var T=${JSON.stringify(token)},busy=0;
function toast(m){var t=document.getElementById("toast");t.textContent=m;t.classList.add("show");setTimeout(function(){t.classList.remove("show")},2800)}
function rsvp(r){if(busy)return;busy=1;
var y=document.getElementById("by"),n=document.getElementById("bn");
y.disabled=n.disabled=true;
fetch("/api/rsvp/respond",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:T,response:r})})
.then(function(res){return res.json().then(function(d){if(!res.ok)throw new Error(d.error);return d})})
.then(function(){
  y.classList.toggle("active",r==="YES");n.classList.toggle("active",r==="NO");
  var b=document.getElementById("rsvp-badge");b.style.display="";
  b.innerHTML=r==="YES"?'<span class="badge y">&#10003; Attending — See you there!</span>':'<span class="badge n">&#10007; We will miss you!</span>';
  document.getElementById("prompt").textContent="Change your response:";
  toast(r==="YES"?"We can't wait to see you! 🎉":"We'll miss you ❤️")
}).catch(function(){toast("Something went wrong. Try again.")})
.finally(function(){y.disabled=n.disabled=false;busy=0})}
var autoR=${JSON.stringify(autoResponse)};
if(autoR==="YES"||autoR==="NO"){setTimeout(function(){rsvp(autoR)},600)}
</script>
</body></html>`;
}
