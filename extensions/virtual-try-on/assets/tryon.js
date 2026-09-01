/**
 * Virtual Try-On storefront loader.
 * Deliberately tiny: styles the button from the shop's config and lazy-loads
 * the modal bundle only when a shopper clicks "Try It On".
 */
(function () {
  "use strict";
  if (window.__tryonLoaderInit) return;
  window.__tryonLoaderInit = true;

  var loaderScript = document.querySelector("script[data-tryon-loader]");
  if (!loaderScript) return;

  var PROXY = loaderScript.getAttribute("data-tryon-proxy") || "/apps/tryon";
  var MODAL_JS = loaderScript.getAttribute("data-tryon-modal-js");
  var MODAL_CSS = loaderScript.getAttribute("data-tryon-modal-css");

  // ---- Anonymous visitor token (first-party, random, never identifies a person)
  function getVisitorToken() {
    var name = "tryon_visitor_id=";
    var cookies = document.cookie.split(";");
    for (var i = 0; i < cookies.length; i++) {
      var c = cookies[i].trim();
      if (c.indexOf(name) === 0) return c.substring(name.length);
    }
    var token = null;
    try { token = localStorage.getItem("tryon_visitor_id"); } catch (e) {}
    if (!token) {
      token =
        (window.crypto && crypto.randomUUID
          ? crypto.randomUUID()
          : String(Date.now()) + "-" + Math.random().toString(36).slice(2)) +
        Math.random().toString(36).slice(2, 10);
    }
    var secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie =
      "tryon_visitor_id=" + token + "; path=/; max-age=31536000; SameSite=Lax" + secure;
    try { localStorage.setItem("tryon_visitor_id", token); } catch (e) {}
    return token;
  }

  function readProductData(root) {
    var el = root.querySelector("[data-tryon-product]");
    if (!el) return null;
    try { return JSON.parse(el.textContent); } catch (e) { return null; }
  }

  // Resolve the currently selected variant: URL param first, then product form.
  function currentVariantId(product) {
    var fromUrl = new URLSearchParams(location.search).get("variant");
    if (fromUrl) return fromUrl;
    var input = document.querySelector('form[action*="/cart/add"] [name="id"]');
    if (input && input.value) return input.value;
    return product && product.selectedVariantId ? String(product.selectedVariantId) : null;
  }

  function applyConfig(root, cfg) {
    var btn = root.querySelector("[data-tryon-button]");
    if (!btn) return;
    var b = cfg.button || {};
    var label = root.querySelector("[data-tryon-label]");
    var icon = root.querySelector("[data-tryon-icon]");
    if (label && b.text) label.textContent = b.text;
    if (icon) icon.hidden = !b.iconEnabled;
    if (b.style === "outline") {
      btn.classList.add("tryon-btn--outline");
      btn.style.background = "transparent";
      btn.style.color = b.backgroundColor || "#111";
      btn.style.borderColor = b.backgroundColor || "#111";
    } else {
      btn.style.background = b.backgroundColor || "#111";
      btn.style.borderColor = b.backgroundColor || "#111";
      btn.style.color = b.textColor || "#fff";
    }
    if (typeof b.borderRadius === "number") btn.style.borderRadius = b.borderRadius + "px";
    if (b.fullWidth) btn.classList.add("tryon-btn--full");
    if (b.size && b.size !== "medium") btn.classList.add("tryon-btn--" + b.size);
    if (b.hoverAnimation && b.hoverAnimation !== "none") {
      btn.classList.add("tryon-btn--hover-" + b.hoverAnimation);
    }
    btn.hidden = false;
  }

  // ---- Funnel events (view / add_to_cart) for conversion analytics.
  function sendEvent(type, productId) {
    if (!productId) return;
    try {
      fetch(PROXY + "/event", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        // keepalive so add_to_cart survives an immediate page navigation
        keepalive: true,
        body: JSON.stringify({
          visitor_token: getVisitorToken(),
          product_id: String(productId),
          type: type,
        }),
      }).catch(function () {});
    } catch (e) {}
  }

  var atcTracked = false;
  function trackAddToCart(productId) {
    // Capture-phase submit still fires when theme JS intercepts for AJAX carts.
    document.addEventListener(
      "submit",
      function (event) {
        var form = event.target;
        if (!form || !form.action || form.action.indexOf("/cart/add") === -1) return;
        if (atcTracked) return; // one event per page view
        atcTracked = true;
        sendEvent("add_to_cart", productId);
      },
      true,
    );
  }

  var modalLoadPromise = null;
  function loadModal() {
    if (modalLoadPromise) return modalLoadPromise;
    modalLoadPromise = new Promise(function (resolve, reject) {
      if (MODAL_CSS) {
        var link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = MODAL_CSS;
        document.head.appendChild(link);
      }
      var script = document.createElement("script");
      script.src = MODAL_JS;
      script.onload = function () {
        if (window.TryOnModal) return resolve(window.TryOnModal);
        reject(new Error("Try-on modal script loaded but did not initialise."));
      };
      script.onerror = function () {
        reject(new Error("Failed to load try-on modal script: " + MODAL_JS));
      };
      document.head.appendChild(script);
    });
    return modalLoadPromise;
  }

  function init() {
    var roots = document.querySelectorAll("[data-tryon-root]");
    if (!roots.length) return;

    var firstProduct = readProductData(roots[0]);
    var configUrl =
      PROXY +
      "/config?product_id=" +
      encodeURIComponent(firstProduct && firstProduct.id ? firstProduct.id : "");

    fetch(configUrl, { headers: { Accept: "application/json" } })
      .then(function (res) {
        if (!res.ok) {
          console.error("[Virtual Try-On] Config request failed:", res.status, configUrl);
          return null;
        }
        return res.json();
      })
      .then(function (cfg) {
        if (!cfg) return;
        if (!cfg.enabled) {
          console.info(
            "[Virtual Try-On] Disabled for this product — check that an AI provider is connected in the app and that try-on is enabled for this product."
          );
          return;
        }
        if (firstProduct && firstProduct.id) {
          sendEvent("view", firstProduct.id);
          trackAddToCart(firstProduct.id);
        }
        roots.forEach(function (root) {
          var product = readProductData(root);
          if (!product) return;
          applyConfig(root, cfg);
          var btn = root.querySelector("[data-tryon-button]");
          btn.addEventListener("click", function () {
            btn.disabled = true;
            loadModal()
              .then(function (TryOnModal) {
                TryOnModal.open({
                  proxy: PROXY,
                  visitorToken: getVisitorToken(),
                  product: product,
                  variantId: currentVariantId(product),
                  config: cfg,
                });
              })
              .catch(function (error) {
                // Surface it: a silent failure looks like a dead button.
                console.error("[Virtual Try-On] Couldn't open the try-on window:", error);
                window.alert("Sorry — the try-on window couldn't open. Please refresh and try again.");
              })
              .then(function () { btn.disabled = false; });
          });
        });
      })
      .catch(function (error) {
        console.error("[Virtual Try-On] Could not reach the app:", error);
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
