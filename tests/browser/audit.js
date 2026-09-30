// Runs inside a collection page: checks every variant card against Shopify's own product data.
window.__vcAudit = async (budgetMs = 38000) => {
  const started = Date.now();
  let rechecks = 0;
  const H = () => document.documentElement.scrollHeight;
  for (let y = 0; y < H() && Date.now() - started < budgetMs / 3; y += Math.round(innerHeight * 0.8)) { scrollTo(0, y); window.__vcIoCheck?.(); await new Promise((r) => setTimeout(r, 200)); window.__vcIoCheck?.(); }
  scrollTo(0, 0);
  await new Promise((r) => setTimeout(r, 1200));
  // The test pane is a background tab, where Chrome pauses CSS transitions (e.g. cards fading in): finish them.
  const settle = () => document.getAnimations().forEach((a) => { try { if (a.effect?.getTiming?.().iterations !== Infinity) a.finish(); } catch {} });
  settle();
  const base = (url) => decodeURIComponent((url || "").split("?")[0].split("/").pop() || "").replace(/\.(jpe?g|png|webp|gif|avif)$/i, "").replace(/_(\d+x\d*|x\d+|pico|icon|thumb|small|compact|medium|large|grande|original|master)(@\dx)?$/i, "").replace(/_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "");
  const visibleIn = (el, card) => { const cr = card.getBoundingClientRect(); for (let n = el; n && n !== card.parentElement; n = n.parentElement) { const s = getComputedStyle(n); if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) return false; } const r = el.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2; return r.width > 20 && r.height > 20 && cx >= cr.left && cx <= cr.right && cy >= cr.top && cy <= cr.bottom; };
  const products = {};
  const load = async (h) => (products[h] ??= fetch(`/products/${h}.js`).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  const cards = [...document.querySelectorAll("[data-vc-card]")];
  const keys = {}; const issues = []; let split = 0;
  const amounts = (c) => [String(c), c % 100 === 0 ? String(c / 100) : null].filter(Boolean);
  const checkCard = async (el, note = "") => {
    const card = el.getAttribute("data-vc-card");
    const key = card + note;
    const hrefs = [...el.querySelectorAll("a[href*='/products/']")].map((a) => a.getAttribute("href"));
    const handle = /\/products\/([^/?#]+)/.exec(hrefs[0] || "")?.[1];
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.height < 40) issues.push(`${key}: card collapsed ${Math.round(r.width)}x${Math.round(r.height)}`);
    if (!key.includes(":") || !handle) return;
    if (!note) split++;
    const p = await load(handle); if (!p) { issues.push(`${key}: no product data`); return; }
    const value = card.slice(card.indexOf(":") + 1);
    const idx = [0, 1, 2].find((i) => p.variants.some((v) => v.options[i] === value)) ?? -1;
    const group = idx >= 0 ? p.variants.filter((v) => v.options[idx] === value) : [];
    const rep = group.find((v) => v.available) ?? group[0];
    if (!rep) { issues.push(`${key}: no variant for "${value}"`); return; }
    // Links named after another color (the theme's swatches) rightly point at that color.
    const others = new Set(idx < 0 ? [] : p.variants.map((v) => v.options[idx]).filter((v) => v !== value).map((v) => v.trim().toLowerCase()));
    const own = [...el.querySelectorAll("a[href*='/products/']")].filter((a) => ![a.textContent, a.getAttribute("title"), a.getAttribute("aria-label"), a.getAttribute("data-value")].some((t) => t && others.has(t.trim().toLowerCase()))).map((a) => a.getAttribute("href"));
    const wrong = own.filter((h) => !h.includes(`variant=${rep.id}`)); if (wrong.length) issues.push(`${key}: link ${wrong[0]} (want variant=${rep.id})`);
    const withImage = rep.featured_image ? rep : group.find((v) => v.featured_image);
    const want = base(withImage?.featured_image?.src || p.featured_image);
    let imgs = [...el.querySelectorAll("img")].filter((img) => visibleIn(img, el));
    if (!imgs.length && rechecks++ < 12 && Date.now() - started < budgetMs) { el.scrollIntoView({ block: "center" }); window.__vcIoCheck?.(); await new Promise((r) => setTimeout(r, 700)); settle(); imgs = [...el.querySelectorAll("img")].filter((img) => visibleIn(img, el)); }
    const shown = imgs.map((img) => base(img.currentSrc || img.getAttribute("src") || ""));
    if (!imgs.length) {
      const why = [...el.querySelectorAll("img")].slice(0, 3).map((img) => { const r = img.getBoundingClientRect(); const hid = []; for (let n = img; n && n !== el.parentElement; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) < 0.05) hid.push(n.tagName.toLowerCase() + "." + [...n.classList].slice(0, 2).join(".") + (cs.display === "none" ? " none" : cs.visibility === "hidden" ? " hidden" : " o=" + cs.opacity)); } return base(img.currentSrc || img.getAttribute("src") || img.getAttribute("data-src") || "") + " " + Math.round(r.width) + "x" + Math.round(r.height) + (hid.length ? " hidden by " + hid.join(" < ") : ""); });
      issues.push(`${key}: no visible image [${why.join(" | ")}] want ${want}`);
    } else if (withImage && !shown.includes(want)) issues.push(`${key}: shows ${shown[0]} (want ${want})`); else if (imgs.some((img) => img.complete && img.naturalWidth === 0)) issues.push(`${key}: image failed to load`);
    const text = el.innerText.replace(/\s+/g, " ");
    const squash = (t) => t.replace(/\s+/g, " ").trim().toLowerCase();
    if (!squash(text).includes(squash(`${p.title} - ${value}`))) issues.push(`${key}: title missing ("${text.slice(0, 60)}")`);
    // Price: the variant's price, or the lowest one ("From …") when the card's variants cost different amounts.
    const prices = group.map((v) => v.price);
    const expect = Math.min(...prices) === Math.max(...prices) ? rep.price : Math.min(...prices);
    const digits = text.replace(/[^\d]/g, "");
    if (!amounts(expect).some((a) => digits.includes(a))) issues.push(`${key}: price ${expect} not shown ("${text.slice(0, 90)}")`);
    // "Sold out" at most once (buttons aside).
    const soldLabels = [...el.querySelectorAll("span, div, p, strong, small, b, dd")].filter((n) => { if (n.closest("button")) return false; const t = (n.textContent || "").trim(); if (!/^(sold ?out|ausverkauft|épuisé|agotado)$/i.test(t)) return false; if ([...n.children].some((c) => (c.textContent || "").trim() === t)) return false; const r = n.getBoundingClientRect(); const cs = getComputedStyle(n); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && Number(cs.opacity) > 0.05; });
    // A theme's scrolling ticker repeats its one label ("Sold out Sold out…"): count it once.
    const soldPlaces = new Set(soldLabels.map((n) => n.parentElement)).size;
    if (soldPlaces > 1) issues.push(`${key}: "Sold out" shown ${soldPlaces} times`);
    // Sold out: a sold-out color says so.
    if (!group.some((v) => v.available) && !/sold out|ausverkauft|épuisé|agotado/i.test(text)) issues.push(`${key}: sold out but no badge`);
  };
  for (const el of cards) {
    const key = el.getAttribute("data-vc-card"); keys[key] = (keys[key] || 0) + 1;
    await checkCard(el);
  }
  // Swatches (when on): visible, not covered by the theme's card link, and picking one redraws the card, on the page.
  let swatched = 0;
  for (const host of [...document.querySelectorAll("vc-swatches")].slice(0, 10)) {
    const el = host.closest("[data-vc-card]");
    const key = el?.getAttribute("data-vc-card") ?? "?";
    const buttons = [...(host.shadowRoot?.querySelectorAll("button") ?? [])];
    if (!el || buttons.length < 2) { issues.push(`${key}: swatches without a card or buttons`); continue; }
    host.scrollIntoView({ block: "center" }); window.__vcIoCheck?.(); await new Promise((r) => setTimeout(r, 250)); settle();
    const r = host.getBoundingClientRect(), cr = el.getBoundingClientRect();
    if (r.width < 20 || r.height < 16 || getComputedStyle(host).visibility === "hidden") { issues.push(`${key}: swatches not visible ${Math.round(r.width)}x${Math.round(r.height)}`); continue; }
    if (r.left < cr.left - 2 || r.right > cr.right + 2 || r.bottom > cr.bottom + 2) issues.push(`${key}: swatches outside the card`);
    const other = buttons.find((b) => b.getAttribute("aria-pressed") !== "true");
    const br = other.getBoundingClientRect();
    const hit = document.elementFromPoint(br.left + br.width / 2, br.top + br.height / 2);
    // Something of the card over the swatches (a link stretched over the card) would take the click. (Pop-ups over the page don't count.)
    if (hit !== host && hit && el.contains(hit)) { issues.push(`${key}: swatch covered by ${hit.tagName.toLowerCase()}.${[...hit.classList].slice(0, 2).join(".")}`); continue; }
    if (hit !== host) continue;
    const page = location.href;
    const back = buttons.find((b) => b.getAttribute("aria-pressed") === "true");
    other.click();
    await new Promise((r) => setTimeout(r, 400)); settle();
    if (location.href !== page) { issues.push(`${key}: picking a swatch left the page`); break; }
    if (el.getAttribute("data-vc-card") === key) issues.push(`${key}: picking ${other.title} didn't change the card`);
    else await checkCard(el, ` (after picking ${other.title})`);
    back?.click();
    await new Promise((r) => setTimeout(r, 200));
    swatched++;
  }
  for (const [key, n] of Object.entries(keys)) if (n > 1) issues.push(`${key}: shown ${n} times`);
  return JSON.stringify({ url: location.pathname, cards: cards.length, split, swatched, issueCount: issues.length, issues: issues.slice(0, 20) });
};
