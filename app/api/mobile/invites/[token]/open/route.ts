import { routing } from "@/i18n/routing";
import { SERVER_URL } from "@/lib/constants";

const MOBILE_DEEP_LINK_SCHEME =
  process.env.MOBILE_DEEP_LINK_SCHEME ?? "com.tiziano.developer.reglo-mobile";

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const safeToken = encodeURIComponent(token);
  const scheme = MOBILE_DEEP_LINK_SCHEME.replace(/:\/*$/, "");
  const deepLink = `${scheme}://invite/${safeToken}`;
  const webFallback = `${SERVER_URL}/${routing.defaultLocale}/invite/${safeToken}`;

  const safeDeepLink = escapeHtml(deepLink);
  const safeWebFallback = escapeHtml(webFallback);

  const html = `<!doctype html>
<html lang="it">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Apri invito Reglo</title>
    <meta http-equiv="refresh" content="4;url=${safeWebFallback}" />
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        margin: 0;
        padding: 24px;
        background: #f2fbf8;
        color: #324d7a;
      }
      .card {
        max-width: 520px;
        margin: 48px auto;
        background: #ffffff;
        border: 1px solid #d8ece7;
        border-radius: 20px;
        padding: 24px;
      }
      a {
        color: #324d7a;
        font-weight: 600;
      }
      p {
        line-height: 1.5;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Stiamo aprendo l'app Reglo...</h1>
      <p>Se non si apre automaticamente, usa il link qui sotto.</p>
      <p><a href="${safeDeepLink}">Apri app</a></p>
      <p>Oppure continua da web:</p>
      <p><a href="${safeWebFallback}">Apri invito su web</a></p>
    </div>
    <script>
      (function() {
        const deepLink = ${JSON.stringify(deepLink)};
        const webFallback = ${JSON.stringify(webFallback)};

        window.location.href = deepLink;

        setTimeout(function() {
          window.location.href = webFallback;
        }, 1800);
      })();
    </script>
  </body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
