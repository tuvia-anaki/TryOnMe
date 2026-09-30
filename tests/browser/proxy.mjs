// Test proxy for Shopify theme demo stores on one port (started by run.mjs): visit /__demo/<host>?to=/collections/all to switch
// (sets a cookie, clears the product cache). Every HTML page gets the app's storefront script injected,
// so the engine runs in a real browser on real theme markup, CSS and JavaScript.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";

const PORT = Number(process.env.PORT || 4600);
const ASSET = new URL("../../extensions/variant-cards/assets/vc-cards.js", import.meta.url);

function demoFrom(req) {
  const m = /(?:^|;\s*)vc_demo=([^;]+)/.exec(req.headers.cookie ?? "");
  return m ? decodeURIComponent(m[1]) : "theme-dawn-demo.myshopify.com";
}

function settingsFrom(req) {
  const m = /(?:^|;\s*)vc_settings=([^;]+)/.exec(req.headers.cookie ?? "");
  try {
    return m ? JSON.parse(decodeURIComponent(m[1])) : {};
  } catch {
    return {};
  }
}

function config(html, extra) {
  // The store's money format, from the first price on the page ("$9.49 CAD" → with currency code).
  const code = /\$[\d.,]+\s([A-Z]{3})\b/.exec(html)?.[1];
  const settings = { split: { enabled: true, by: "auto", title: "{product} - {value}" }, ...extra };
  return {
    template: "collection",
    collection: { handle: "all", id: 1 },
    settings,
    collectionSettings: null,
    money: { plain: "$1,234.56", withCurrency: code ? `$1,234.56 ${code}` : "$1,234.56" },
    texts: { from: "From {price}", soldOut: "Sold out" },
    designMode: false,
  };
}

createServer(async (req, res) => {
  try {
    if (req.url === "/__vc/audit.js") {
      res.writeHead(200, { "Content-Type": "text/javascript", "Cache-Control": "no-store" });
      return res.end(readFileSync(new URL("./audit.js", import.meta.url)));
    }
    if (req.url === "/__vc/vc-cards.js") {
      res.writeHead(200, { "Content-Type": "text/javascript", "Cache-Control": "no-store" });
      return res.end(readFileSync(ASSET));
    }
    const switchTo = /^\/__demo\/([^/?]+)(?:\?to=(.*))?$/.exec(req.url);
    if (switchTo) {
      const to = decodeURIComponent(switchTo[2] || "/collections/all");
      res.writeHead(200, { "Content-Type": "text/html", "Set-Cookie": `vc_demo=${encodeURIComponent(switchTo[1])}; Path=/` });
      return res.end(`<script>try{sessionStorage.clear()}catch(e){};location.replace(${JSON.stringify(to)})</script>`);
    }
    const demoHost = demoFrom(req);
    const upstream = await fetch(`https://${demoHost}${req.url}`, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/140 Safari/537.36", Accept: req.headers.accept ?? "*/*" },
      redirect: "manual",
    });
    const headers = {};
    upstream.headers.forEach((value, key) => {
      if (!["content-encoding", "content-length", "content-security-policy", "transfer-encoding", "set-cookie", "strict-transport-security"].includes(key)) headers[key] = value;
    });
    if (headers.location) headers.location = headers.location.replace(`https://${demoHost}`, "");
    const type = upstream.headers.get("content-type") ?? "";
    if (type.includes("text/html") && !req.url.includes("sections=") && !req.url.includes("section_id=")) {
      let html = await upstream.text();
      html = html.replaceAll(`https://${demoHost}/`, "/").replaceAll(`//${demoHost}/`, "/");
      const inject = `<script type="application/json" id="vc-config">${JSON.stringify(config(html, settingsFrom(req)))}</script><script src="/__vc/vc-cards.js" defer></script>`;
      html = html.replace("</head>", `${inject}</head>`);
      // The test pane is a background tab, where IntersectionObserver never fires (no rendering). Report every
      // observed element as on screen once, like a shopper scrolling past it, so themes' reveal-on-scroll runs.
      const io = `<script>(function(){var all=new Set();function inView(el,m){var r=el.getBoundingClientRect();return (r.width>0||r.height>0)&&r.bottom>=-m&&r.top<=innerHeight+m&&r.right>=-m&&r.left<=innerWidth+m}window.__vcIoCheck=function(){all.forEach(function(o){o.check()})};window.IntersectionObserver=function(cb,opts){var self=this,t=new Map(),m=parseInt((opts&&opts.rootMargin)||"0",10)||0;this.root=null;this.rootMargin=(opts&&opts.rootMargin)||"0px";this.thresholds=[0];this.check=function(){var entries=[];t.forEach(function(prev,el){var v=inView(el,m);if(v!==prev){t.set(el,v);var r=el.getBoundingClientRect();entries.push({target:el,isIntersecting:v,intersectionRatio:v?1:0,boundingClientRect:r,intersectionRect:r,rootBounds:null,time:performance.now()})}});if(entries.length)cb(entries,self)};this.observe=function(el){if(!t.has(el)){t.set(el,null);setTimeout(self.check,30)}};this.unobserve=function(el){t.delete(el)};this.disconnect=function(){t.clear()};this.takeRecords=function(){return[]};all.add(this)};setInterval(window.__vcIoCheck,300)})();</script>`;
      if (/(?:^|;\s*)vc_io=1/.test(req.headers.cookie ?? "")) html = html.replace(/<head[^>]*>/i, (tag) => tag + io);
      res.writeHead(upstream.status, { ...headers, "content-type": "text/html; charset=utf-8" });
      return res.end(html);
    }
    // Theme scripts and styles that point at the store's own domain (module imports, fonts) must stay same-origin.
    if (/javascript|css|json/.test(type)) {
      const text = (await upstream.text()).replaceAll(`https://${demoHost}/`, "/").replaceAll(`//${demoHost}/`, "/");
      res.writeHead(upstream.status, headers);
      return res.end(text);
    }
    res.writeHead(upstream.status, headers);
    res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    res.writeHead(502, { "Content-Type": "text/plain" });
    res.end(String(error));
  }
}).listen(PORT, () => console.log(`theme demos proxy on http://localhost:${PORT}`));
