# ✂️ Photo Studio

**A free, open-source product photo editor that runs entirely in your browser.** Remove backgrounds, erase unwanted objects, add studio scenes and realistic shadows, put text on top, resize for every marketplace, batch-process a whole catalogue and upscale with AI. No sign-up, no server, no uploads: your photos never leave your device.

**Live app:** https://ashswin-git.github.io/photo-studio/

## Features

### AI tools (on-device)
- **Background remover:** one-click AI cutout for products, people, animals and objects.
- **Retouch / object remover:** brush over people, props, text, stains or watermarks and the LaMa inpainting model fills in what was behind them.
- **Edit cutout:** Erase and Restore brushes with adjustable size and hardness to perfect the mask, re-run the AI cutout, or keep the whole photo.
- **AI upscale:** export at 2× or 4× resolution with Real-ESRGAN.

### Backgrounds
- Transparent, 14 solid colours, a custom colour picker and 14 gradients.
- 14 product scenes drawn in the browser: Studio white, Grey sweep, Pink/Mint/Sand podiums, Wood table, Marble, Concrete, Spotlight, Sunset, Beach, Kitchen, Bokeh and Lavender arch. Podiums and floors line up under the product automatically.
- Your own background image.
- Keep the original background, or blur it with an adjustable amount.

### Shadows and effects
- Shadow types: **Soft**, **Hard**, **Floating**, **Cast** (perspective floor shadow) and **Contact**.
- Shadow controls: intensity, softness, direction, distance/spread and colour.
- Mirror **reflection** with opacity and length.
- **Outline** (sticker-style stroke) around the product, with width and colour.

### Adjustments
- Exposure, brightness, contrast, saturation, warmth and sharpness.
- Filter presets: Vivid, Bright, Warm, Cool, B&W, Matte, Vintage, Crisp and Dramatic.

### Layout
- Move, scale (drag, mouse wheel or pinch), rotate and flip the product, with centre snapping.
- **Center** and **Sit on floor** shortcuts, plus a padding slider to expand the canvas around the product.
- Crop the source photo.

### Text, stickers and logos
- Ready-made designs: SALE −50%, New arrival, Price tag, Free delivery, Bestseller, Limited offer, Brand title, YouTube thumbnail, Diwali offer and Instagram promo.
- Text layers with 10 fonts, size, colour, bold, label background, outline and shadow.
- Emoji stickers and logo/image upload.
- Per-layer rotate, opacity, duplicate, delete and bring forward/send back.

### Sizes
- **Marketplaces:** Amazon, Shopify, Etsy, eBay, Flipkart, Meesho, Poshmark, Depop and Vinted.
- **Social:** Instagram post, portrait and story/Reels, WhatsApp status and catalog, YouTube thumbnail, Facebook post and Marketplace, Pinterest, X/Twitter, LinkedIn and TikTok.
- **Other:** common ratios (1:1, 4:5, 3:4, 4:3, 16:9, 9:16), the original size, or any custom W × H.

### Batch mode
- Add many photos at once. Each photo gets its background removed and the current style applied: background, shadow, outline, adjustments, size, padding and text/logo layers.
- Download everything as one ZIP. You can also open any batch photo in the editor.

### Export
- PNG, JPG or WEBP, with a quality slider, a transparent-background toggle, a custom file name and optional 2×/4× AI upscaling.

### Editor
- Undo/redo (Ctrl+Z, Ctrl+Shift+Z) and hold-to-compare with the original.
- Drag & drop, paste from the clipboard, or try one of the sample photos.
- Dark UI, with a bottom toolbar on phones.

## How it works
Everything happens client-side. The page itself is small, and each AI model downloads only the first time you use its tool:

| Tool | Model | Download |
| --- | --- | --- |
| Background remover | IMG.LY ISNet | a few dozen MB |
| Object remover | LaMa (big-lama, ONNX) | about 200 MB |
| Upscaler | Real-ESRGAN `realesr-general-x4v3` | about 5 MB |

Models are cached by the browser after the first download. A small service worker (`coi-serviceworker.js`) enables cross-origin isolation on GitHub Pages, so ONNX Runtime can use multi-threaded WebAssembly, which is several times faster.

## Built with
- HTML, CSS and vanilla JavaScript (ES modules), Canvas 2D
- [@imgly/background-removal](https://github.com/imgly/background-removal-js): background removal
- [ONNX Runtime Web](https://onnxruntime.ai/): runs the LaMa and Real-ESRGAN models in WebAssembly
- [LaMa](https://github.com/advimman/lama) inpainting model, ONNX export by [Carve/LaMa-ONNX](https://huggingface.co/Carve/LaMa-ONNX) (Apache-2.0)
- [Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN) `realesr-general-x4v3` (BSD-3-Clause), ONNX file from [Hugging Face](https://huggingface.co/JoPmt/Real_Esrgan_x2_Onnx_Tflite_Tfjs)
- [coi-serviceworker](https://github.com/gzuidhof/coi-serviceworker) (MIT)
- [Google Fonts](https://fonts.google.com/): Poppins, Montserrat, Bebas Neue, Oswald, Playfair Display and Pacifico (SIL Open Font License)
- Sample photos from [Unsplash](https://unsplash.com/) (Unsplash License)
- jsDelivr and Hugging Face CDNs, GitHub Pages hosting

## Run locally
```bash
git clone https://github.com/ashswin-git/photo-studio
cd photo-studio
python3 -m http.server 8080
# open http://localhost:8080
```
It has no build step and no dependencies to install.

## Browser support
It works best in a recent desktop Chrome, Edge or Firefox. Mobile browsers work too. The object remover needs roughly 1 GB of free memory, so it can be slow or fail on low-end phones.

## License
[AGPL-3.0](LICENSE), matching the background-removal library.
