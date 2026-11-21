# ✂️ Photo Studio

A free, private background remover and product photo studio that runs entirely in your browser. Your images never leave your device.

**Live:** https://ashswin-git.github.io/photo-studio/

## Features
- One-click AI background removal (drag & drop, upload, or paste)
- New backgrounds: transparent, solid colours, custom colour picker, gradients, or your own image
- Blur the original background instead of replacing it
- Product look: auto-centre, adjustable padding and soft drop shadow
- Size presets: original, 1:1, 4:5, 9:16, 16:9, 3:4
- Download as transparent PNG or JPG
- Hold-to-compare with the original
- Mobile-friendly layout

## Built with
- HTML, CSS and vanilla JavaScript (single `index.html`)
- [@imgly/background-removal](https://github.com/imgly/background-removal-js) (on-device AI segmentation via ONNX Runtime Web)
- jsDelivr CDN
- GitHub Pages hosting

## Run locally
Serve the folder with any static server, e.g. `python3 -m http.server`, and open http://localhost:8000.

## License
AGPL-3.0, matching the background removal library.
