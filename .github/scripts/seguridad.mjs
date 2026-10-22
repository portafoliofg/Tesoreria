// Abre el sitio con Chrome y muestra por qué el navegador lo marcaría "No es seguro":
// estado de seguridad que informa Chrome, pedidos sin https (de la página y de los
// iframes) y avisos de "Mixed Content" en la consola.
import { chromium } from "playwright";

const url = process.argv[2];
const browser = await chromium.launch();
const page = await browser.newPage();
const cdp = await page.context().newCDPSession(page);
let estado = null;
cdp.on("Security.visibleSecurityStateChanged", e => { estado = e.visibleSecurityState; });
await cdp.send("Security.enable");

const inseguros = new Set();
page.on("request", r => { if (r.url().startsWith("http:")) inseguros.add(r.resourceType() + " " + r.url() + " (desde " + (r.frame() ? r.frame().url() : "?") + ")"); });
page.on("console", m => { const t = m.text(); if (/mixed content|insecure|not secure/i.test(t)) console.log("CONSOLA:", t); });
page.on("framenavigated", f => console.log("FRAME:", f.url()));

await page.goto(url, { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(25000);

console.log("ESTADO:", estado ? estado.securityState : "sin dato");
if (estado) {
  console.log("DETALLE:", JSON.stringify({ safetyTip: estado.safetyTipInfo, cert: estado.certificateSecurityState && { protocol: estado.certificateSecurityState.protocol, issuer: estado.certificateSecurityState.issuer, obsolete: estado.certificateSecurityState.obsoleteSslProtocol }, razones: estado.securityStateIssueIds }));
}
console.log(inseguros.size ? "PEDIDOS SIN HTTPS:\n" + [...inseguros].join("\n") : "PEDIDOS SIN HTTPS: ninguno");
await browser.close();
