// Harness pages imitating common theme gallery + picker markups.
import { COLORS, MEDIA, SETTINGS, SIZES, VARIANTS, imageUrl, productJson } from "./fixture.mjs";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const SEC = "template--1__main";

function head(title, { selected = null, settings = SETTINGS, extraHead = "", config } = {}) {
  const product = productJson({ selected, ...(config !== undefined ? { config } : {}) });
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
body{font-family:system-ui,sans-serif;margin:0;padding:16px;color:#1a1a1a}
nav.harness{font-size:13px;margin-bottom:12px} nav.harness a{margin-right:10px}
.layout{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:24px;max-width:1100px}
@media(max-width:760px){.layout{grid-template-columns:1fr}}
img{max-width:100%;display:block}
button{font:inherit}
#debug{font:12px/1.4 monospace;background:#f5f5f5;padding:8px;margin-top:12px;white-space:pre-wrap}
</style>
<style id="pvi-base">[data-pvi-hidden],[data-pvi-native-hidden]{display:none!important}</style>
<script type="application/json" id="pvi-settings">${JSON.stringify(settings)}</script>
<script type="application/json" id="pvi-i18n">{"soldOut":"Sold out","unavailable":"Unavailable"}</script>
<script type="application/json" id="pvi-product">${JSON.stringify(product)}</script>
${extraHead}
<script src="/assets/pvi-product.js" defer></script>
<script src="/assets/pvi-swatches.js" defer></script>
</head><body>
<nav class="harness"><a href="/">← scenarios</a> <strong>${esc(title)}</strong></nav>`;
}

const debugScript = `<div id="debug"></div><script>
setInterval(function(){
  var id=(document.querySelector('form[action*="/cart/add"] [name=id]')||{}).value;
  var shown=[].slice.call(document.querySelectorAll('[data-pvi-hidden]')).length;
  document.getElementById('debug').textContent='variant='+id+'  url='+location.search+'  hiddenItems='+shown;
},300);
</script>`;

function variantFor(color, size) {
  return VARIANTS.find((v) => v.color === color && v.size === size);
}

/* ---------- 1. Dawn-like: scroll-snap slider-component, radios, section re-render ---------- */
export function dawn() {
  const slides = MEDIA.map(
    (m, i) => `<li id="Slide-${SEC}-${m.id}" class="product__media-item grid__item slider__slide${i === 0 ? " is-active" : ""}" data-media-id="${SEC}-${m.id}">
      <div class="product-media-container"><div class="product__media media"><img src="${imageUrl(m.file, { width: 1946 })}" srcset="${imageUrl(m.file, { width: 493 })} 493w, ${imageUrl(m.file, { width: 1946 })} 1946w" alt="${esc(m.alt)}" width="1946" height="1946"></div></div></li>`,
  ).join("");
  const thumbs = MEDIA.map(
    (m, i) => `<li id="Slide-Thumbnail-${SEC}-${i + 1}" class="thumbnail-list__item slider__slide" data-target="${SEC}-${m.id}" data-media-position="${i + 1}">
      <button class="thumbnail" aria-label="Load image ${i + 1}" ${i === 0 ? 'aria-current="true"' : ""}><img src="${imageUrl(m.file, { width: 416 })}" alt="" width="416" height="416"></button></li>`,
  ).join("");
  const modal = MEDIA.map((m) => `<img class="global-media-settings" src="${imageUrl(m.file, { width: 1100 })}" data-media-id="${m.id}" alt="">`).join("");
  return `${head("Dawn-like (scroll-snap, radios, section re-render)")}
<style>
.product__media-list{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;gap:8px;list-style:none;padding:0;margin:0}
.product__media-item{flex:0 0 100%;scroll-snap-align:start}
.thumbnail-list{display:flex;gap:6px;list-style:none;padding:0;margin:8px 0;overflow-x:auto}
.thumbnail-list__item{flex:0 0 72px} .thumbnail{border:1px solid #ccc;padding:0;background:none;cursor:pointer}
.thumbnail[aria-current=true]{border-color:#000}
.product-media-modal__content{display:none}
fieldset{border:0;padding:0;margin:0 0 12px} fieldset input{position:absolute;opacity:0}
fieldset label{display:inline-block;border:1px solid #999;border-radius:20px;padding:6px 14px;margin:0 6px 6px 0;cursor:pointer}
fieldset input:checked+label{background:#000;color:#fff}
.slider-counter{font-size:13px;margin:6px 0}
</style>
<section id="shopify-section-${SEC}" class="shopify-section">
 <div class="layout">
  <media-gallery id="MediaGallery-${SEC}">
   <slider-component id="GalleryViewer-${SEC}">
    <ul id="Slider-Gallery-${SEC}" class="product__media-list slider">${slides}</ul>
    <div class="slider-counter"><span class="slider-counter--current">1</span> / <span class="slider-counter--total">${MEDIA.length}</span></div>
   </slider-component>
   <slider-component id="GalleryThumbnails-${SEC}" class="thumbnail-slider">
    <ul id="Slider-Thumbnails-${SEC}" class="thumbnail-list slider">${thumbs}</ul>
   </slider-component>
   <div class="product-media-modal__content">${modal}</div>
  </media-gallery>
  <product-info id="ProductInfo-${SEC}">
   <h1>Classic tee</h1>
   <variant-selects id="variant-selects-${SEC}"></variant-selects>
   <form method="post" action="/cart/add" id="product-form-${SEC}"><input type="hidden" name="id" value="${VARIANTS[0].id}"><button type="submit" name="add">Add to cart</button></form>
  </product-info>
 </div>
</section>
${debugScript}
<script>
var VARIANTS=${JSON.stringify(VARIANTS)};
var COLORS=${JSON.stringify(COLORS.map((c) => c.name))}, SIZES=${JSON.stringify(SIZES.map((s) => s.name))};
function renderPicker(color,size){
  function fs(name,idx,values,sel){return '<fieldset class="js product-form__input product-form__input--pill"><legend class="form__label">'+name+'</legend>'+values.map(function(v,i){var id='${SEC}-'+idx+'-'+i;return '<input type="radio" id="'+id+'" name="'+name+'-'+idx+'" value="'+v+'" form="product-form-${SEC}"'+(v===sel?' checked':'')+'><label for="'+id+'">'+v+'</label>';}).join('')+'</fieldset>';}
  document.getElementById('variant-selects-${SEC}').innerHTML=fs('Color',1,COLORS,color)+fs('Size',2,SIZES,size);
}
var params=new URLSearchParams(location.search);var initial=VARIANTS.find(function(v){return String(v.id)===params.get('variant')})||VARIANTS[0];
renderPicker(initial.color,initial.size);document.querySelector('[name=id]').value=initial.id;
customElements.define('slider-component',class extends HTMLElement{
  connectedCallback(){this.initPages();}
  initPages(){var items=[].slice.call(this.querySelectorAll('.slider__slide')).filter(function(e){return e.clientWidth>0});var t=this.querySelector('.slider-counter--total');if(t)t.textContent=items.length;this.pagesInitialized=(this.pagesInitialized||0)+1;}
  resetPages(){this.initPages();}
});
function setActiveMedia(mediaId){
  document.querySelectorAll('.product__media-item').forEach(function(li){li.classList.toggle('is-active',li.dataset.mediaId==='${SEC}-'+mediaId)});
  var active=document.querySelector('.product__media-item.is-active');
  if(active&&active.parentElement){active.parentElement.scrollTo({left:active.offsetLeft-active.parentElement.offsetLeft});}
  document.querySelectorAll('.thumbnail').forEach(function(b){b.removeAttribute('aria-current')});
  var th=document.querySelector('[data-target="${SEC}-'+mediaId+'"] .thumbnail');if(th)th.setAttribute('aria-current','true');
}
document.addEventListener('change',function(e){
  if(!e.target.closest('variant-selects'))return;
  var color=document.querySelector('input[name="Color-1"]:checked').value, size=document.querySelector('input[name="Size-2"]:checked').value;
  setTimeout(function(){ // simulate Dawn's section fetch
    var v=VARIANTS.find(function(x){return x.color===color&&x.size===size});
    renderPicker(color,size);
    if(!v)return;
    document.querySelector('[name=id]').value=v.id;
    history.replaceState({},'','?variant='+v.id);
    setActiveMedia(v.featured);
  },150);
});
document.addEventListener('click',function(e){var li=e.target.closest('.thumbnail-list__item');if(li){setActiveMedia(li.dataset.target.split('-').pop());}});
</script></body></html>`;
}

/* ---------- 2. Swiper with thumbs, select pickers, URL-less updates, no data attributes ---------- */
export function swiper() {
  const slides = MEDIA.map((m) => `<div class="swiper-slide"><img src="${imageUrl(m.file, { width: 1200 })}" alt="${esc(m.alt)}"></div>`).join("");
  const thumbs = MEDIA.map((m) => `<div class="swiper-slide"><img src="${imageUrl(m.file, { width: 200 })}" alt=""></div>`).join("");
  const select = (name, values) =>
    `<label>${name}<br><select name="options[${name}]" id="SingleOptionSelector-${name}">${values.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join("")}</select></label><br><br>`;
  return `${head("Swiper (thumbs, selects, no media ids)", {
    extraHead: '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.css">',
  })}
<style>.main-swiper{width:100%;max-width:560px}.thumbs-swiper{margin-top:8px;max-width:560px}.thumbs-swiper .swiper-slide{opacity:.5;cursor:pointer}.thumbs-swiper .swiper-slide-thumb-active{opacity:1}</style>
<section class="shopify-section" id="shopify-section-main">
 <div class="layout">
  <div class="product-gallery">
   <div class="swiper main-swiper"><div class="swiper-wrapper">${slides}</div><div class="swiper-button-next"></div><div class="swiper-button-prev"></div><div class="swiper-pagination"></div></div>
   <div class="swiper thumbs-swiper"><div class="swiper-wrapper">${thumbs}</div></div>
  </div>
  <div><h1>Classic tee</h1>
   <form method="post" action="/cart/add">${select("Color", COLORS.map((c) => c.name))}${select("Size", SIZES.map((s) => s.name))}
    <input type="hidden" name="id" value="${VARIANTS[0].id}"><button type="submit">Add to cart</button></form>
  </div>
 </div>
</section>
${debugScript}
<script src="https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.js"></script>
<script>
var VARIANTS=${JSON.stringify(VARIANTS)};
var thumbs=new Swiper('.thumbs-swiper',{slidesPerView:5,spaceBetween:8,watchSlidesProgress:true});
var main=new Swiper('.main-swiper',{spaceBetween:10,navigation:{nextEl:'.swiper-button-next',prevEl:'.swiper-button-prev'},pagination:{el:'.swiper-pagination',clickable:true},thumbs:{swiper:thumbs}});
document.querySelectorAll('select[name^=options]').forEach(function(s){s.addEventListener('change',function(){
  var c=document.querySelector('[name="options[Color]"]').value,z=document.querySelector('[name="options[Size]"]').value;
  var v=VARIANTS.find(function(x){return x.color===c&&x.size===z});if(v)document.querySelector('[name=id]').value=v.id;
});});
</script></body></html>`;
}

/* ---------- 3. Flickity + asNavFor, button picker ---------- */
export function flickity() {
  const cells = MEDIA.map((m) => `<div class="carousel-cell" data-image-id="${m.imageId}"><img src="${imageUrl(m.file, { width: 1000 })}" alt="${esc(m.alt)}"></div>`).join("");
  const nav = MEDIA.map((m) => `<div class="carousel-cell nav-cell"><img src="${imageUrl(m.file, { width: 150 })}" alt=""></div>`).join("");
  const group = (name, values) =>
    `<div class="option" data-option="${name}"><div>${name}</div>${values
      .map((v, i) => `<button type="button" class="opt-btn${i === 0 ? " is-active" : ""}" data-value="${esc(v)}">${esc(v)}</button>`)
      .join("")}</div>`;
  return `${head("Flickity (asNavFor, button picker, image ids)", {
    extraHead: '<link rel="stylesheet" href="https://unpkg.com/flickity@2/dist/flickity.min.css">',
  })}
<style>.gallery-main .carousel-cell{width:100%;max-width:520px;margin-right:10px}.gallery-nav .carousel-cell{width:90px;margin-right:6px;opacity:.6}.gallery-nav .is-nav-selected{opacity:1}
.opt-btn{border:1px solid #999;background:#fff;padding:6px 12px;margin:0 6px 6px 0;border-radius:4px}.opt-btn.is-active{background:#000;color:#fff}.option{margin-bottom:10px}</style>
<section class="shopify-section" id="shopify-section-main">
 <div class="layout">
  <div class="product-gallery"><div class="gallery-main">${cells}</div><div class="gallery-nav">${nav}</div></div>
  <div><h1>Classic tee</h1>${group("Color", COLORS.map((c) => c.name))}${group("Size", SIZES.map((s) => s.name))}
   <form method="post" action="/cart/add"><select name="id" style="display:none">${VARIANTS.map((v) => `<option value="${v.id}">${v.color} / ${v.size}</option>`).join("")}</select><button type="submit">Add to cart</button></form>
  </div>
 </div>
</section>
${debugScript}
<script src="https://unpkg.com/flickity@2/dist/flickity.pkgd.min.js"></script>
<script>
var VARIANTS=${JSON.stringify(VARIANTS)};
new Flickity('.gallery-main',{pageDots:true,prevNextButtons:true,cellAlign:'left'});
new Flickity('.gallery-nav',{asNavFor:'.gallery-main',contain:true,pageDots:false,prevNextButtons:false,cellAlign:'left'});
document.addEventListener('click',function(e){var b=e.target.closest('.opt-btn');if(!b)return;
  b.parentElement.querySelectorAll('.opt-btn').forEach(function(x){x.classList.toggle('is-active',x===b)});
  var c=document.querySelector('[data-option=Color] .is-active').dataset.value,z=document.querySelector('[data-option=Size] .is-active').dataset.value;
  var v=VARIANTS.find(function(x){return x.color===c&&x.size===z});if(v){document.querySelector('[name=id]').value=v.id;document.dispatchEvent(new CustomEvent('variant:change',{detail:{variant:v}}));}
});
</script></body></html>`;
}

/* ---------- 4. Slick (jQuery), radios named options[...] ---------- */
export function slick() {
  const slides = MEDIA.map((m) => `<div class="slide"><img src="${imageUrl(m.file, { width: 900 })}" alt="${esc(m.alt)}"></div>`).join("");
  const radios = (name, values) =>
    `<div class="opt"><div>${name}</div>${values
      .map((v, i) => `<label><input type="radio" name="options[${name}]" value="${esc(v)}"${i === 0 ? " checked" : ""}> ${esc(v)}</label> `)
      .join("")}</div>`;
  return `${head("Slick (jQuery, infinite clones, radios)", {
    extraHead:
      '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/slick-carousel@1.8.1/slick/slick.css"><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/slick-carousel@1.8.1/slick/slick-theme.css">',
  })}
<style>.product-slider{max-width:520px;margin:0 20px}.opt{margin:10px 0}.slick-prev:before,.slick-next:before{color:#000}</style>
<section class="shopify-section" id="shopify-section-main">
 <div class="layout">
  <div><div class="product-slider">${slides}</div></div>
  <div><h1>Classic tee</h1><form method="post" action="/cart/add">${radios("Color", COLORS.map((c) => c.name))}${radios("Size", SIZES.map((s) => s.name))}
   <input type="hidden" name="id" value="${VARIANTS[0].id}"><button type="submit">Add to cart</button></form></div>
 </div>
</section>
${debugScript}
<script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/slick-carousel@1.8.1/slick/slick.min.js"></script>
<script>
var VARIANTS=${JSON.stringify(VARIANTS)};
$('.product-slider').slick({dots:true,infinite:true,arrows:true});
$(document).on('change','input[name^=options]',function(){
  var c=$('input[name="options[Color]"]:checked').val(),z=$('input[name="options[Size]"]:checked').val();
  var v=VARIANTS.find(function(x){return x.color===c&&x.size===z});if(v){$('[name=id]').val(v.id);history.pushState({},'','?variant='+v.id);}
});
</script></body></html>`;
}

/* ---------- 5. Legacy: featured image + thumbnails, single-option-selector ---------- */
export function legacy() {
  const thumbs = MEDIA.map(
    (m) => `<li class="grid__item"><a href="${imageUrl(m.file, { legacy: true, width: 1024 })}" class="product-single__thumbnail" data-image-id="${m.imageId}"><img src="${imageUrl(m.file, { legacy: true, width: 160 })}" alt=""></a></li>`,
  ).join("");
  const sel = (label, idx, values) =>
    `<div class="selector-wrapper"><label>${label}</label> <select class="single-option-selector" data-index="option${idx}">${values
      .map((v) => `<option value="${esc(v)}">${esc(v)}</option>`)
      .join("")}</select></div>`;
  return `${head("Legacy (featured image + thumbnails, classic selects, _160x URLs)")}
<style>.product-single__thumbnails{display:flex;flex-wrap:wrap;gap:6px;list-style:none;padding:0}.product-single__thumbnails li{width:70px}.product-single__photo-wrapper{max-width:480px}.selector-wrapper{margin:8px 0}</style>
<section class="shopify-section" id="shopify-section-product-template">
 <div class="layout">
  <div class="product-single__photos">
   <div class="product-single__photo-wrapper"><img id="FeaturedImage" src="${imageUrl(MEDIA[1].file, { legacy: true, width: 1024 })}" alt=""></div>
   <ul class="product-single__thumbnails">${thumbs}</ul>
  </div>
  <div><h1>Classic tee</h1>
   <form method="post" action="/cart/add" id="AddToCartForm">
    <select name="id" id="ProductSelect" style="display:none">${VARIANTS.map((v) => `<option value="${v.id}">${v.color} / ${v.size}</option>`).join("")}</select>
    ${sel("Color", 1, COLORS.map((c) => c.name))}${sel("Size", 2, SIZES.map((s) => s.name))}
    <button type="submit">Add to cart</button>
   </form></div>
 </div>
</section>
${debugScript}
<script>
var VARIANTS=${JSON.stringify(VARIANTS)};var MEDIA=${JSON.stringify(MEDIA)};
document.addEventListener('click',function(e){var a=e.target.closest('.product-single__thumbnail');if(!a)return;e.preventDefault();
  document.getElementById('FeaturedImage').src=a.href;});
document.querySelectorAll('.single-option-selector').forEach(function(s){s.addEventListener('change',function(){
  var c=document.querySelector('[data-index=option1]').value,z=document.querySelector('[data-index=option2]').value;
  var v=VARIANTS.find(function(x){return x.color===c&&x.size===z});if(!v)return;
  document.getElementById('ProductSelect').value=v.id;
  var m=MEDIA.find(function(x){return x.id===v.featured});
  if(m)document.getElementById('FeaturedImage').src='${imageUrl("FILE", { legacy: true, width: 1024 })}'.replace('FILE',m.file);
});});
</script></body></html>`;
}

/* ---------- 6. Stacked grid with lazy loading (data-src, {width} templates) ---------- */
export function grid() {
  const items = MEDIA.map(
    (m) => `<div class="product__photo" data-image-id="${m.imageId}"><img class="lazyload" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" data-src="${imageUrl(m.file, { legacy: true, width: "{width}" })}" data-widths="[360,540,720]" alt="${esc(m.alt)}"></div>`,
  ).join("");
  const radios = (name, values) =>
    `<fieldset><legend>${name}</legend>${values
      .map((v, i) => `<label><input type="radio" name="${name}" value="${esc(v)}"${i === 0 ? " checked" : ""}> ${esc(v)}</label> `)
      .join("")}</fieldset>`;
  return `${head("Stacked grid (lazy data-src, {width} URLs, pushState)")}
<style>.product__photos{display:grid;grid-template-columns:1fr 1fr;gap:8px}.product__photo img{width:100%;aspect-ratio:1;background:#f2f2f2}fieldset{border:0;padding:0;margin:0 0 10px}</style>
<section class="shopify-section" id="shopify-section-product">
 <div class="layout">
  <div class="product__photos product__photos--stacked">${items}</div>
  <div><h1>Classic tee</h1><form method="post" action="/cart/add">${radios("Color", COLORS.map((c) => c.name))}${radios("Size", SIZES.map((s) => s.name))}
   <input type="hidden" name="id" value="${VARIANTS[0].id}"><button type="submit">Add to cart</button></form></div>
 </div>
</section>
${debugScript}
<script>
var VARIANTS=${JSON.stringify(VARIANTS)};
setTimeout(function(){document.querySelectorAll('img.lazyload').forEach(function(img){img.src=img.dataset.src.replace('{width}','540');img.classList.add('lazyloaded');});},400);
document.addEventListener('change',function(e){if(!e.target.matches('fieldset input'))return;
  var c=document.querySelector('input[name=Color]:checked').value,z=document.querySelector('input[name=Size]:checked').value;
  var v=VARIANTS.find(function(x){return x.color===c&&x.size===z});if(v){document.querySelector('[name=id]').value=v.id;history.pushState({},'','?variant='+v.id);}
});
</script></body></html>`;
}

/* ---------- 7. Collection grid for card swatches ---------- */
export function cards() {
  const handles = ["linen-shirt", "wool-sweater", "canvas-sneaker", "silk-scarf", "denim-jacket", "cotton-cap"];
  const card = (h) => `<li class="grid__item"><div class="card-wrapper product-card-wrapper"><div class="card">
    <div class="card__media"><img src="/cdn/shop/files/${h}-red.jpg?v=1&width=533" alt="${h}" width="533" height="533"></div>
    <div class="card__content"><h3 class="card__heading"><a href="/products/${h}" class="full-unstyled-link">${h.replace("-", " ")}</a></h3>
    <div class="price"><span class="price-item">$49.00</span></div></div></div></div></li>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Cards</title>
<style>body{font-family:system-ui;padding:16px}ul.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:18px;list-style:none;padding:0}.card{position:relative}.card__heading a::after{content:"";position:absolute;inset:0;z-index:1}</style>
<style id="pvi-base">[data-pvi-hidden],[data-pvi-native-hidden]{display:none!important}</style>
<script type="application/json" id="pvi-settings">${JSON.stringify(SETTINGS)}</script>
<script src="/assets/pvi-cards.js" defer></script></head><body>
<nav><a href="/">← scenarios</a> <strong>Collection cards</strong></nav>
<h1>Collection</h1><ul class="grid product-grid">${handles.map(card).join("")}</ul></body></html>`;
}

export const SCENARIOS = { dawn, swiper, flickity, slick, legacy, grid, cards };
