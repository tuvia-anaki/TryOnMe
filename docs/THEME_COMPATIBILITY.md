# Theme compatibility notes

The storefront script finds galleries on its own; no per-theme code is needed for most themes. How it works:

1. **Find media references** inside the product section: id attributes (`data-media-id`, `data-image-id`, `data-target`, `data-id`, `aria-controls`, element ids like `Slide-…-<id>`, Kalles' `media_id_<id>` class…) and image URLs (`src`, `srcset`, lazy-load attributes, zoom links), matched by exact file name (legacy `_800x` / `{width}x` suffixes handled).
2. **Items** are the largest elements that contain exactly one media; items sharing a parent form a list (main slider, thumbnails, zoom/lightbox). Lists need two or more media.
3. **Hide/show** with the native `hidden` attribute + `is-filtered` class + our own attribute, then tell the slider: Swiper (detach + `update()`, loop rebuild), Flickity (`remove`/`append`), Slick (`slickFilter`), Splide (`refresh()`), Dawn `slider-component` (`resetPages()`), Clean Canvas `carousel-slider` (`refresh()`), Focal `flickity-carousel` (`reload()`), Horizon/Prestige/Impact custom carousels (native `hidden`).
4. **Variant changes** are picked up from the shopper's click on the theme picker (instant), the product form's `id` field, the `?variant=` URL, 17 theme event names, and a 400 ms safety poll.

## Checked against real markup (September 2026)

Gallery detection and picker detection were run against product-page markup from these theme demos: Dawn 15, Dawn 2.5/5.0 (Sense, Refresh), Horizon 3.2, Prestige 11, Impulse 9, Impact 7, Focal 11, Warehouse 3, Symmetry 8, Motion 12, Broadcast 8, Be Yours 8, Enterprise 2, Expanse 6, Palo Alto 9, Empire 13, Stiletto 6, Minimog 6, Ella 7, Kalles 3, Shrine 1.6, Pipeline 8, Streamline 6, Showcase 10.

Result: galleries found on all 25, every media present in the page markup matched, native pickers recognized on all 25 (radio, select and button pickers; values as names, option-value ids or handles).

The swiping/navigation behaviour itself was exercised in a browser against real Swiper 11, Flickity 2 and Slick 1.8 plus Dawn-style scroll-snap and classic thumbnail galleries (see `harness/`).

## Theme features that conflict

Turn these off when using the app, otherwise both hide images:

| Theme | Setting / behaviour |
|---|---|
| Dawn family (Dawn, Refresh, Sense, Craft, Studio, Taste, …), Be Yours, Shrine | "Hide other variants' media" (`hide_variants`) — the app warns about this on its home page |
| Focal, Warehouse, Impulse/Motion/Streamline (image sets), Be Yours (gang), Ella | Grouping images by alt text such as `#color_red` — you can import that grouping with **Auto-assign → By alt text** and then turn the theme option off |
| Symmetry, Showcase, Enterprise | "Group media by variant" |
| Stiletto | "Multiple variant media" |
| Minimog | "Variant group images" |
| Prestige, Impact | Built-in media filtering (`filtered-indexes`) |

## If a gallery isn't detected

Settings → Theme compatibility → **Gallery item selector**: a CSS selector matching one slide/thumbnail, e.g. `.product-gallery__item`. Everything else still works automatically.
