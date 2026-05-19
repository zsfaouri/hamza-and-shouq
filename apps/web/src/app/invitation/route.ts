import { activeTemplate } from "@/lib/domain";
import { loadState } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const state = await loadState();
  const template = activeTemplate(state);
  const origin = new URL(request.url).origin;
  const hasMedia = Boolean(template.mediaData && template.mediaMimeType);
  const imageUrl = hasMedia ? `${origin}/api/media/invitation` : "";

  return new Response(`<!doctype html>
<html dir="rtl" lang="ar"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>دعوة حفل زفاف حمزة و شوق</title>
<meta property="og:title" content="دعوة حفل زفاف حمزة و شوق 💒">
<meta property="og:description" content="يسعدنا دعوتكم لحضور حفل زفافنا">
<meta property="og:type" content="website">
${imageUrl ? `<meta property="og:image" content="${imageUrl}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${imageUrl}">` : ""}
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Tahoma,sans-serif;background:linear-gradient(135deg,#faf9f7 0%,#f0ebe3 100%);color:#1a1a2e;min-height:100vh;display:grid;place-items:center;padding:16px}
.card{background:#fff;border-radius:16px;padding:40px 28px;width:min(520px,100%);box-shadow:0 20px 60px rgba(26,26,46,.08);text-align:center}
img{max-width:100%;border-radius:12px;margin-bottom:24px}
h1{font-size:1.6rem;margin-bottom:8px;color:#2d2d44}
p{color:#6b7280;font-size:0.95rem}
</style>
</head><body>
<main class="card">
${imageUrl ? `<img src="${imageUrl}" alt="دعوة الزفاف">` : ""}
<h1>حفل زفاف حمزة و شوق 💒</h1>
<p>يسعدنا دعوتكم لحضور حفل زفافنا</p>
</main>
</body></html>`, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
