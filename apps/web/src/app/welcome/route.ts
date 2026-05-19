export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return new Response(welcomePage(), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function welcomePage() {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title>Hamza &amp; Shouq — Wedding</title>
<meta property="og:title" content="Hamza &amp; Shouq Wedding">
<meta property="og:description" content="You are invited to the wedding of Hamza &amp; Shouq — Friday, 03 July 2026">
<meta property="og:type" content="website">
<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400..800;1,400..800&family=Manrope:wght@200..800&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet">
<style>
@font-face{font-family:'Alhanoof';src:url('/fonts/Alharbi-Alhanoof.otf') format('opentype');font-weight:400;font-style:normal;font-display:swap}
*{margin:0;padding:0;box-sizing:border-box}
html,body{height:100%;overflow:hidden}
body{font-family:Manrope,sans-serif;background:#f7fbec;color:#181d14}

.bg{position:fixed;inset:0;z-index:0;overflow:hidden}
.bg svg{position:absolute;opacity:.18}
.bg .tl{top:-5%;left:-5%;width:45%;height:55%}
.bg .tr{top:-5%;right:-5%;width:45%;height:55%;transform:scaleX(-1)}
.bg .bl{bottom:-5%;left:-5%;width:40%;height:45%;transform:scaleY(-1)}
.bg .br{bottom:-5%;right:-5%;width:40%;height:45%;transform:scale(-1)}

.page{position:relative;z-index:1;height:100vh;height:100dvh;display:flex;align-items:center;justify-content:center;padding:12px}
.card{width:100%;max-width:400px;display:flex;flex-direction:column;align-items:center;gap:clamp(14px,2.5vh,24px)}

.lbl{font-size:10px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#4a654a}
.serif{font-family:'EB Garamond',serif;font-weight:400}
.sub{color:#5f5f59;font-style:italic;font-size:13px}
.mat{font-family:'Material Symbols Outlined';font-size:16px;color:#4a654a}

header{text-align:center;display:flex;flex-direction:column;align-items:center;gap:4px}
header h1{font-size:clamp(28px,5vw,42px);line-height:1.15;color:#243d25}
header h1 em{font-style:italic;font-weight:300}

.div-line{display:flex;align-items:center;gap:10px;width:140px}
.div-line i{height:1px;flex:1;background:#c3c8bf}
.div-line .mat{font-variation-settings:'FILL' 1;font-size:14px;opacity:.7}

.info{background:rgba(247,251,236,.55);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.25);border-radius:16px;padding:18px 22px;width:100%;text-align:center;display:flex;flex-direction:column;gap:12px}
.info .row-label{display:flex;align-items:center;justify-content:center;gap:5px}
.info .val{font-size:clamp(17px,2.5vw,21px);color:#243d25;line-height:1.25;margin-top:2px}
.info .val-sub{font-size:clamp(14px,2vw,17px);color:#5f5f59}
.sep{width:36px;height:1px;background:rgba(195,200,191,.35);margin:0 auto}

.cd{display:flex;align-items:center;justify-content:center;gap:clamp(10px,3vw,20px)}
.cd-u{text-align:center}
.cd-u .n{font-size:clamp(26px,4.5vw,38px);color:#4a654a;line-height:1}
.cd-u .l{font-size:9px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#5f5f59;margin-top:2px}
.cd-s{font-size:clamp(22px,4vw,34px);color:rgba(195,200,191,.5);padding-bottom:12px}

.acts{display:grid;grid-template-columns:1fr 1fr;gap:8px;width:100%}
.act{flex:1;padding:10px 8px;border-radius:10px;border:none;cursor:pointer;font-family:Manrope,sans-serif;font-weight:600;font-size:11px;letter-spacing:.06em;text-transform:uppercase;display:flex;align-items:center;justify-content:center;gap:6px;text-decoration:none;transition:all .15s}
.act .mat{font-size:18px}
.act.p{background:#4a654a;color:#fff}.act.p:hover{opacity:.88}
.act.s{background:rgba(255,255,255,.45);border:1px solid #c09d25;color:#453600}.act.s:hover{background:rgba(255,255,255,.7)}
.act.o{background:transparent;border:1px solid #c3c8bf;color:#5f5f59}.act.o:hover{background:rgba(224,228,214,.25)}

.foot{font-size:11px;color:#9ca3af;text-align:center}

@keyframes up{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
.fi{animation:up .5s ease-out both}
.d1{animation-delay:.05s}.d2{animation-delay:.1s}.d3{animation-delay:.15s}
.d4{animation-delay:.2s}.d5{animation-delay:.25s}.d6{animation-delay:.3s}

@media(min-width:700px){
  .card{max-width:440px;gap:clamp(16px,2.5vh,28px)}
  header h1{font-size:48px}
  .info{padding:22px 30px;gap:14px}
  .act{padding:12px 10px;font-size:12px}
}
@media(max-height:680px){
  .card{gap:8px}
  .info{padding:12px 16px;gap:8px}
  .cd-u .n{font-size:24px}
  .acts{gap:6px}
  .act{padding:8px 6px;font-size:10px}
}
</style>
</head>
<body>

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
    <span class="lbl">You Are Cordially Invited</span>
    <h1 class="serif">Hamza <em>&amp;</em> Shouq</h1>
    <p class="sub">Request the pleasure of your company at their wedding</p>
  </header>

  <div class="div-line fi d1"><i></i><span class="mat" style="font-variation-settings:'FILL' 1">local_florist</span><i></i></div>

  <section class="info fi d2">
    <div>
      <div class="row-label"><span class="mat">calendar_month</span><span class="lbl">When</span></div>
      <p class="val serif">Friday, 03 July 2026</p>
      <p class="val-sub serif">20:00 GMT+3</p>
    </div>
    <div class="sep"></div>
    <div>
      <div class="row-label"><span class="mat">location_on</span><span class="lbl">Where</span></div>
      <p class="val serif">Diwan Al-Haj Hassan</p>
      <p class="val-sub serif">Amman, Jordan</p>
    </div>
  </section>

  <section class="cd fi d3">
    <div class="cd-u"><span class="n serif" id="cd-d">--</span><span class="l">Days</span></div>
    <span class="cd-s serif">:</span>
    <div class="cd-u"><span class="n serif" id="cd-h">--</span><span class="l">Hrs</span></div>
    <span class="cd-s serif">:</span>
    <div class="cd-u"><span class="n serif" id="cd-m">--</span><span class="l">Min</span></div>
    <span class="cd-s serif">:</span>
    <div class="cd-u"><span class="n serif" id="cd-s">--</span><span class="l">Sec</span></div>
  </section>

  <nav class="acts fi d4">
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

  <p class="foot fi d5">Hamza &amp; Shouq &hearts;</p>

</div>
</div>

<script>
var W=new Date("2026-07-03T17:00:00Z");
function tick(){var d=Math.max(0,W-new Date()),D=d/864e5|0,H=d%864e5/36e5|0,M=d%36e5/6e4|0,S=d%6e4/1e3|0;
document.getElementById("cd-d").textContent=String(D).padStart(2,"0");
document.getElementById("cd-h").textContent=String(H).padStart(2,"0");
document.getElementById("cd-m").textContent=String(M).padStart(2,"0");
document.getElementById("cd-s").textContent=String(S).padStart(2,"0")}
tick();setInterval(tick,1000);
</script>
</body></html>`;
}
