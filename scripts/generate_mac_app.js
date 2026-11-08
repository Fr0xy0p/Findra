const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1024,
    height: 1024,
    show: false,
    webPreferences: {
      offscreen: true
    }
  });

  const svgContent = `<!DOCTYPE html>
  <html>
  <head>
    <style>
      body { margin: 0; padding: 0; background: transparent; width: 1024px; height: 1024px; display: flex; align-items: center; justify-content: center; }
      .squircle {
        width: 860px;
        height: 860px;
        border-radius: 195px;
        background: linear-gradient(135deg, #090d16 0%, #1e1b4b 35%, #1e3a8a 70%, #2563eb 100%);
        box-shadow: 0 40px 90px rgba(0, 0, 0, 0.6), inset 0 2px 4px rgba(255, 255, 255, 0.25);
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        border: 2px solid rgba(255, 255, 255, 0.15);
      }
      .ring {
        position: absolute;
        width: 520px;
        height: 520px;
        border-radius: 50%;
        border: 28px solid rgba(96, 165, 250, 0.45);
        box-shadow: 0 0 60px rgba(59, 130, 246, 0.6), inset 0 0 60px rgba(139, 92, 246, 0.4);
      }
      .letter-f {
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif;
        font-size: 420px;
        font-weight: 900;
        color: #ffffff;
        text-shadow: 0 10px 40px rgba(0, 0, 0, 0.8), 0 0 80px rgba(96, 165, 250, 0.9);
        z-index: 2;
        letter-spacing: -15px;
        margin-left: 20px;
      }
      .sparkle {
        position: absolute;
        top: 210px;
        right: 210px;
        font-size: 90px;
        color: #60a5fa;
        filter: drop-shadow(0 0 20px #38bdf8);
        z-index: 3;
      }
    </style>
  </head>
  <body>
    <div class="squircle">
      <div class="ring"></div>
      <div class="letter-f">F</div>
      <div class="sparkle">✦</div>
    </div>
  </body>
  </html>`;

  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(svgContent));

  // Small delay to ensure rendering completes
  await new Promise(r => setTimeout(r, 600));

  const image = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 });
  const outDir = path.join(__dirname, '..', 'build_assets');
  fs.mkdirSync(outDir, { recursive: true });

  const iconsetDir = path.join(outDir, 'Findra.iconset');
  fs.mkdirSync(iconsetDir, { recursive: true });

  const basePng = path.join(outDir, 'icon_1024.png');
  fs.writeFileSync(basePng, image.toPNG());
  console.log('✓ 1024x1024 master icon created at', basePng);

  // Generate Apple standard icon sizes using sips
  const sizes = [
    { size: 16, name: 'icon_16x16.png' },
    { size: 32, name: 'icon_16x16@2x.png' },
    { size: 32, name: 'icon_32x32.png' },
    { size: 64, name: 'icon_32x32@2x.png' },
    { size: 128, name: 'icon_128x128.png' },
    { size: 256, name: 'icon_128x128@2x.png' },
    { size: 256, name: 'icon_256x256.png' },
    { size: 512, name: 'icon_256x256@2x.png' },
    { size: 512, name: 'icon_512x512.png' },
    { size: 1024, name: 'icon_512x512@2x.png' }
  ];

  for (const s of sizes) {
    const dest = path.join(iconsetDir, s.name);
    execSync(`sips -z ${s.size} ${s.size} "${basePng}" --out "${dest}" > /dev/null 2>&1`);
  }

  // Convert iconset to .icns using macOS iconutil
  const icnsPath = path.join(outDir, 'Findra.icns');
  execSync(`iconutil -c icns "${iconsetDir}" -o "${icnsPath}"`);
  console.log('✓ macOS .icns file generated at', icnsPath);

  app.quit();
});
