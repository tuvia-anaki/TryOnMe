/**
 * Virtual Try-On modal (lazy-loaded).
 * Vanilla JS, no dependencies. Talks to the app exclusively through the
 * Shopify app proxy (/apps/tryon/*) — never holds any API keys or prompts.
 */
(function () {
  "use strict";
  if (window.TryOnModal) return;

  var MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
  var MAX_DIMENSION = 1536;
  var ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
  var POLL_INTERVAL = 2500;
  var GEN_STATUSES = ["Preparing your images", "Creating your try-on", "Finishing the result"];

  var ctx = null; // { proxy, visitorToken, product, variantId, config }
  var els = {}; // overlay, body, title, subtitle, steps, toast
  var state = {};

  function resetState() {
    state = {
      photoBlob: null,
      photoPreviewUrl: null,
      photoId: null,
      jobId: null,
      pollTimer: null,
      statusTimer: null,
      cameraStream: null,
      history: null,
      latestPhoto: null,
      currentResult: null,
    };
  }

  // ---------- helpers ----------

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function api(path, body) {
    var payload = Object.assign({ visitor_token: ctx.visitorToken }, body || {});
    return fetch(ctx.proxy + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        return { status: res.status, data: data };
      });
    });
  }

  function toast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("is-visible");
    setTimeout(function () { els.toast.classList.remove("is-visible"); }, 2600);
  }

  function stopTimers() {
    if (state.pollTimer) clearTimeout(state.pollTimer);
    if (state.statusTimer) clearInterval(state.statusTimer);
    state.pollTimer = state.statusTimer = null;
  }

  function stopCamera() {
    if (state.cameraStream) {
      state.cameraStream.getTracks().forEach(function (t) { t.stop(); });
      state.cameraStream = null;
    }
  }

  function currentVariant() {
    var product = ctx.product;
    var id = ctx.variantId ? String(ctx.variantId) : null;
    var found = null;
    if (id && product.variants) {
      for (var i = 0; i < product.variants.length; i++) {
        if (String(product.variants[i].id) === id) { found = product.variants[i]; break; }
      }
    }
    if (!found && product.variants && product.variants.length) found = product.variants[0];
    return found;
  }

  function productImage() {
    var variant = currentVariant();
    return (variant && variant.image) || ctx.product.featuredImage || "";
  }

  function guidanceText() {
    var hay = ((ctx.product.type || "") + " " + (ctx.product.title || "")).toLowerCase();
    if (/sunglass|eyeglass|glasses|eyewear|jewel|necklace|earring/.test(hay)) {
      return "For best results, use a clear, well-lit photo of your face and shoulders.";
    }
    if (/dress|gown|jumpsuit|pant|jean|trouser|skirt|shoe|sneaker|boot/.test(hay)) {
      return "For best results, use a clear full-body photo taken from the front.";
    }
    return "For best results, use a clear front-facing photo showing your upper body.";
  }

  function setSteps(step) {
    els.steps.innerHTML = "";
    if (!step) { els.steps.style.display = "none"; return; }
    els.steps.style.display = "flex";
    var d1 = el("span", "tryon-steps__dot" + (step >= 1 ? " is-active" : ""), "1");
    var line = el("span", "tryon-steps__line");
    var d2 = el("span", "tryon-steps__dot" + (step >= 2 ? " is-active" : ""), "2");
    els.steps.appendChild(d1); els.steps.appendChild(line); els.steps.appendChild(d2);
  }

  function setView(node, step) {
    stopCamera();
    setSteps(step);
    els.body.innerHTML = "";
    els.body.appendChild(node);
  }

  function cta(label, onClick, ghost) {
    var btn = el("button", "tryon-cta" + (ghost ? " tryon-cta--ghost" : ""), label);
    btn.type = "button";
    btn.addEventListener("click", onClick);
    return btn;
  }

  // ---------- image processing (EXIF-corrected resize/compress) ----------

  function processFile(file) {
    return new Promise(function (resolve, reject) {
      if (ACCEPTED_TYPES.indexOf(file.type) === -1) {
        return reject(new Error("Please use a JPEG, PNG or WebP photo."));
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        return reject(new Error("That photo is too large. Please use one under 8 MB."));
      }
      var opts = { imageOrientation: "from-image" };
      createImageBitmap(file, opts)
        .catch(function () { return createImageBitmap(file); })
        .then(function (bitmap) {
          var scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
          var w = Math.round(bitmap.width * scale);
          var h = Math.round(bitmap.height * scale);
          if (w < 200 || h < 200) throw new Error("That photo is too small. Please use a larger one.");
          var canvas = document.createElement("canvas");
          canvas.width = w; canvas.height = h;
          canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
          canvas.toBlob(function (blob) {
            if (!blob) return reject(new Error("We couldn't read this photo. Please try another one."));
            resolve(blob);
          }, "image/jpeg", 0.87);
        })
        .catch(reject);
    });
  }

  function uploadPhoto(blob) {
    var form = new FormData();
    form.append("photo", blob, "photo.jpg");
    form.append("visitor_token", ctx.visitorToken);
    return fetch(ctx.proxy + "/upload", { method: "POST", body: form }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok || !data.photoId) {
          throw new Error(data.message || "We couldn't upload this photo. Please try again.");
        }
        return data;
      });
    });
  }

  // ---------- views ----------

  function viewIntro() {
    var view = el("div", "tryon-view");
    view.appendChild(el("h3", null, "Ready to try it on?"));
    view.appendChild(el("p", "tryon-muted", "Upload your photo and see how it looks on you."));

    var img = el("img", "tryon-product-thumb");
    img.src = productImage();
    img.alt = ctx.product.title || "";
    view.appendChild(img);

    var fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/jpeg,image/png,image/webp";
    fileInput.style.display = "none";
    fileInput.addEventListener("change", function () {
      if (fileInput.files && fileInput.files[0]) handleChosenFile(fileInput.files[0]);
      fileInput.value = "";
    });
    view.appendChild(fileInput);

    view.appendChild(cta("+ Choose Your Photo", function () { fileInput.click(); }));
    view.appendChild(cta("📷 Take a Photo", function () { openCamera(); }, true));

    // Let shoppers get back to a try-on they generated and closed:
    // most recent completed try-on for THIS product, one click away.
    var lastForProduct = null;
    if (state.history && state.history.items.length) {
      for (var hi = 0; hi < state.history.items.length; hi++) {
        if (String(state.history.items[hi].productId) === String(ctx.product.id)) {
          lastForProduct = state.history.items[hi];
          break;
        }
      }
    }
    if (lastForProduct) {
      view.appendChild(cta("👀 View your last try-on", (function (item) {
        return function () {
          viewResult({
            id: item.id,
            resultUrl: item.resultUrl,
            productTitle: item.productTitle,
            productId: item.productId,
          });
        };
      })(lastForProduct), true));
    }

    if (state.latestPhoto) {
      view.appendChild(cta("Use my previous photo", function () {
        state.photoId = state.latestPhoto.id;
        state.photoPreviewUrl = state.latestPhoto.url;
        state.photoBlob = null;
        viewConfirm();
      }, true));
    }

    var clear = el("button", "tryon-textbtn", "Clear my photos and try-ons");
    clear.type = "button";
    clear.addEventListener("click", function () {
      clear.disabled = true;
      api("/visitor/delete", {}).then(function () {
        state.history = null;
        state.latestPhoto = null;
        toast("Your photos and try-ons were deleted");
        renderHistoryButton();
        viewIntro();
      });
    });
    view.appendChild(clear);

    setView(view, 1);
  }

  function handleChosenFile(file) {
    processFile(file)
      .then(function (blob) {
        state.photoBlob = blob;
        state.photoId = null;
        if (state.photoPreviewUrl) URL.revokeObjectURL(state.photoPreviewUrl);
        state.photoPreviewUrl = URL.createObjectURL(blob);
        viewConfirm();
      })
      .catch(function (error) { toast(error.message || "We couldn't use this photo."); });
  }

  function openCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      // Fallback: file input with camera capture (mobile browsers).
      var input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.capture = "user";
      input.addEventListener("change", function () {
        if (input.files && input.files[0]) handleChosenFile(input.files[0]);
      });
      input.click();
      return;
    }

    var view = el("div", "tryon-view");
    view.appendChild(el("h3", null, "Take a photo"));
    view.appendChild(el("p", "tryon-muted", guidanceText()));
    var video = el("video", "tryon-video");
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    view.appendChild(video);
    var snap = cta("Capture", function () {
      var canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      var c = canvas.getContext("2d");
      // Mirror back so the saved photo matches reality (preview is mirrored).
      c.translate(canvas.width, 0);
      c.scale(-1, 1);
      c.drawImage(video, 0, 0);
      canvas.toBlob(function (blob) {
        stopCamera();
        if (blob) handleChosenFile(new File([blob], "camera.jpg", { type: "image/jpeg" }));
      }, "image/jpeg", 0.92);
    });
    snap.disabled = true;
    view.appendChild(snap);
    view.appendChild(cta("Back", function () { viewIntro(); }, true));
    setView(view, 1);

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 } }, audio: false })
      .then(function (stream) {
        state.cameraStream = stream;
        video.srcObject = stream;
        snap.disabled = false;
      })
      .catch(function () {
        toast("Camera unavailable. Try uploading a photo instead.");
        viewIntro();
      });
  }

  function viewConfirm() {
    var view = el("div", "tryon-view");
    view.appendChild(el("h3", null, "Looking good?"));
    view.appendChild(el("p", "tryon-muted", guidanceText()));
    var img = el("img", "tryon-photo-preview");
    img.src = state.photoPreviewUrl;
    img.alt = "Your photo";
    view.appendChild(img);
    view.appendChild(cta("Generate My Try-On", startGeneration));
    view.appendChild(cta("Use Another Photo", function () { viewIntro(); }, true));
    setView(view, 2);
  }

  function viewGenerating() {
    var view = el("div", "tryon-view");
    view.appendChild(el("h3", null, "Creating your try-on…"));
    var thumbs = el("div", "tryon-gen-thumbs");
    var you = el("img"); you.src = state.photoPreviewUrl; you.alt = "You";
    var plus = el("span", "tryon-gen-plus", "+");
    var prod = el("img"); prod.src = productImage(); prod.alt = ctx.product.title || "";
    thumbs.appendChild(you); thumbs.appendChild(plus); thumbs.appendChild(prod);
    view.appendChild(thumbs);
    view.appendChild(el("div", "tryon-spinner"));
    var status = el("p", "tryon-gen-status", GEN_STATUSES[0]);
    view.appendChild(status);
    view.appendChild(el("p", "tryon-muted", "This usually takes under a minute."));
    setView(view, 2);

    var idx = 0;
    state.statusTimer = setInterval(function () {
      idx = Math.min(idx + 1, GEN_STATUSES.length - 1);
      status.textContent = GEN_STATUSES[idx];
    }, 9000);
  }

  function startGeneration() {
    viewGenerating();
    var ensurePhoto = state.photoId
      ? Promise.resolve({ photoId: state.photoId })
      : uploadPhoto(state.photoBlob);

    ensurePhoto
      .then(function (uploaded) {
        state.photoId = uploaded.photoId;
        return api("/generate", {
          photo_id: state.photoId,
          product_id: String(ctx.product.id),
          variant_id: ctx.variantId ? String(ctx.variantId) : null,
        });
      })
      .then(function (res) {
        if (res.status === 429 || (res.data && res.data.error === "visitor_limit")) {
          return viewError("You've reached today's try-on limit.", true);
        }
        if (!res.data || !res.data.jobId) {
          return viewError((res.data && res.data.message) || "We couldn't create this try-on. Please try again.");
        }
        state.jobId = res.data.jobId;
        pollJob();
      })
      .catch(function (error) {
        viewError(error.message || "We couldn't create this try-on. Please try again.");
      });
  }

  function pollJob() {
    api("/job", { job_id: state.jobId })
      .then(function (res) {
        var data = res.data || {};
        if (data.status === "completed" && data.resultUrl) {
          stopTimers();
          state.currentResult = {
            id: state.jobId,
            resultUrl: data.resultUrl,
            productTitle: ctx.product.title,
          };
          state.history = null; // refresh next time it's opened
          viewResult(state.currentResult);
        } else if (data.status === "failed") {
          stopTimers();
          viewError(data.message || "We couldn't create this try-on. Please try again.");
        } else {
          state.pollTimer = setTimeout(pollJob, POLL_INTERVAL);
        }
      })
      .catch(function () {
        state.pollTimer = setTimeout(pollJob, POLL_INTERVAL * 2);
      });
  }

  function viewResult(result) {
    var view = el("div", "tryon-view");
    var img = el("img", "tryon-result-img");
    img.src = result.resultUrl;
    img.alt = "Your virtual try-on";
    view.appendChild(img);
    view.appendChild(el("p", "tryon-result-title", result.productTitle || ctx.product.title || ""));

    var variant = currentVariant();
    var canBuy = variant && variant.available !== false;
    var isCurrentProduct = !result.productId || String(result.productId) === String(ctx.product.id);
    if (variant && isCurrentProduct) {
      var add = cta(canBuy ? "Add to Cart" : "Sold Out", function () {
        add.disabled = true;
        fetch("/cart/add.js", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ id: Number(variant.id), quantity: 1 }),
        })
          .then(function (res) { if (!res.ok) throw new Error(); return res.json(); })
          .then(function () {
            add.textContent = "✓ Added to Cart";
            document.documentElement.dispatchEvent(
              new CustomEvent("cart:refresh", { bubbles: true }),
            );
          })
          .catch(function () {
            add.disabled = false;
            toast("Couldn't add to cart. Please try again.");
          });
      });
      if (!canBuy) add.disabled = true;
      view.appendChild(add);
    }

    var row = el("div", "tryon-row");
    row.appendChild(cta("Try Again", function () {
      state.jobId = null;
      state.photoId ? startGeneration() : viewIntro();
    }, true));
    row.appendChild(cta("Use Another Photo", function () { viewIntro(); }, true));
    view.appendChild(row);

    if (navigator.share) {
      view.appendChild(cta("Share", function () {
        fetch(result.resultUrl)
          .then(function (r) { return r.blob(); })
          .then(function (blob) {
            var file = new File([blob], "try-on.png", { type: blob.type || "image/png" });
            return navigator.share({ files: [file], title: "My virtual try-on" });
          })
          .catch(function () {});
      }, true));
    }

    var feedback = el("div", "tryon-feedback");
    feedback.appendChild(el("span", null, "How did it turn out?"));
    var up = el("button", null, "👍 Looks realistic");
    var down = el("button", null, "👎 Doesn't match");
    function sendFeedback(rating, btn, other) {
      btn.classList.add("is-selected");
      other.classList.remove("is-selected");
      api("/feedback", { try_on_id: result.id, rating: rating });
    }
    up.addEventListener("click", function () { sendFeedback("up", up, down); });
    down.addEventListener("click", function () { sendFeedback("down", down, up); });
    feedback.appendChild(up);
    feedback.appendChild(down);
    view.appendChild(feedback);

    setView(view, 2);
  }

  function viewError(message, isLimit) {
    var view = el("div", "tryon-view");
    view.appendChild(el("div", "tryon-error-icon", isLimit ? "⏳" : "😓"));
    view.appendChild(el("h3", null, isLimit ? "That's it for today" : "Something went wrong"));
    view.appendChild(el("p", "tryon-muted", message));
    if (!isLimit) view.appendChild(cta("Try Again", function () { viewIntro(); }));
    view.appendChild(cta("Close", closeModal, true));
    setView(view, null);
  }

  function viewHistory() {
    var view = el("div", "tryon-view");
    view.appendChild(el("h3", null, "Your Try-Ons"));
    var loading = el("p", "tryon-muted", "Loading…");
    view.appendChild(loading);
    setView(view, null);

    loadHistory().then(function (history) {
      loading.remove();
      if (!history || !history.items.length) {
        view.appendChild(el("p", "tryon-muted", "No try-ons yet on this device."));
        view.appendChild(cta("Back", function () { viewIntro(); }, true));
        return;
      }
      var grid = el("div", "tryon-history-grid");
      history.items.forEach(function (item) {
        var card = el("button", "tryon-history-card");
        card.type = "button";
        var img = el("img");
        img.src = item.resultUrl;
        img.alt = item.productTitle;
        img.loading = "lazy";
        var meta = el("div", "meta");
        var t = el("span", "t", item.productTitle);
        var d = el("span", "d", new Date(item.createdAt).toLocaleDateString());
        meta.appendChild(t); meta.appendChild(d);
        card.appendChild(img); card.appendChild(meta);
        card.addEventListener("click", function () {
          viewResult({
            id: item.id,
            resultUrl: item.resultUrl,
            productTitle: item.productTitle,
            productId: item.productId,
          });
        });
        grid.appendChild(card);
      });
      view.appendChild(grid);
      view.appendChild(cta("Back", function () { viewIntro(); }, true));
    });
  }

  function loadHistory() {
    if (state.history) return Promise.resolve(state.history);
    return api("/history", {}).then(function (res) {
      var data = res.data || {};
      state.history = { items: data.items || [] };
      state.latestPhoto = data.latestPhoto || null;
      renderHistoryButton();
      return state.history;
    }).catch(function () { return { items: [] }; });
  }

  function renderHistoryButton() {
    var has = (state.history && state.history.items.length) || state.latestPhoto;
    els.historyBtn.style.display = has ? "inline-flex" : "none";
  }

  // ---------- shell ----------

  function buildShell() {
    var overlay = el("div", "tryon-overlay");
    overlay.addEventListener("click", function (e) { if (e.target === overlay) closeModal(); });

    var drawer = el("div", "tryon-drawer");
    // Merchant modal design (config.modal) via CSS custom properties.
    var m = ctx.config.modal || {};
    if (m.backgroundColor) drawer.style.setProperty("--tryon-modal-bg", m.backgroundColor);
    if (m.textColor) drawer.style.setProperty("--tryon-modal-text", m.textColor);
    if (m.accentColor) drawer.style.setProperty("--tryon-modal-accent", m.accentColor);
    if (typeof m.borderRadius === "number") {
      drawer.style.setProperty("--tryon-modal-radius", m.borderRadius + "px");
    }
    drawer.setAttribute("role", "dialog");
    drawer.setAttribute("aria-modal", "true");
    drawer.setAttribute("aria-label", "Virtual try-on");

    var head = el("div", "tryon-head");
    var historyBtn = el("button", "tryon-iconbtn", "🕒");
    historyBtn.type = "button";
    historyBtn.title = "Your try-ons";
    historyBtn.style.display = "none";
    historyBtn.addEventListener("click", viewHistory);

    var titles = el("div", "tryon-head__titles");
    var title = el("h2", "tryon-head__title", (ctx.config.modal && ctx.config.modal.title) || "Try It On");
    var subtitle = el("p", "tryon-head__subtitle", (ctx.config.modal && ctx.config.modal.subtitle) || "See how it looks on you");
    titles.appendChild(title); titles.appendChild(subtitle);

    var closeBtn = el("button", "tryon-iconbtn", "✕");
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.addEventListener("click", closeModal);

    head.appendChild(historyBtn); head.appendChild(titles); head.appendChild(closeBtn);

    var steps = el("div", "tryon-steps");
    var body = el("div", "tryon-body");
    var fine = el("div", "tryon-fineprint",
      "By using this service, your photo is sent to an AI provider to create the image. AI can make mistakes — results are a preview, not an exact fit.");
    var toastEl = el("div", "tryon-toast");

    drawer.appendChild(head);
    drawer.appendChild(steps);
    drawer.appendChild(body);
    drawer.appendChild(fine);
    drawer.appendChild(toastEl);
    overlay.appendChild(drawer);

    els = { overlay: overlay, body: body, steps: steps, toast: toastEl, historyBtn: historyBtn };
  }

  function onKeydown(e) { if (e.key === "Escape") closeModal(); }

  function closeModal() {
    stopTimers();
    stopCamera();
    document.removeEventListener("keydown", onKeydown);
    if (els.overlay) {
      els.overlay.classList.remove("is-open");
      var node = els.overlay;
      setTimeout(function () { node.remove(); }, 220);
    }
    document.documentElement.style.overflow = "";
    els = {};
  }

  window.TryOnModal = {
    open: function (options) {
      ctx = options;
      resetState();
      buildShell();
      document.body.appendChild(els.overlay);
      document.documentElement.style.overflow = "hidden";
      requestAnimationFrame(function () { els.overlay.classList.add("is-open"); });
      document.addEventListener("keydown", onKeydown);
      viewIntro();
      // Load history in the background so "Use my previous photo" appears.
      loadHistory().then(function () {
        var hasExtras = state.latestPhoto || (state.history && state.history.items.length);
        if (hasExtras && els.body) {
          var introVisible = els.body.querySelector(".tryon-view h3");
          if (introVisible && introVisible.textContent === "Ready to try it on?") viewIntro();
        }
      });
    },
    close: closeModal,
  };
})();
