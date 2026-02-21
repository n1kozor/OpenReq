const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const rootDir = path.resolve(__dirname, '..', '..');
const desktopDir = path.resolve(__dirname, '..');
const outputDir = path.join(desktopDir, 'assets', 'nsis');

const logoPrimary = path.join(rootDir, 'docs', 'logo.png');
const logoFallback = path.join(desktopDir, 'assets', 'icon.png');
const logoPath = fs.existsSync(logoPrimary) ? logoPrimary : logoFallback;

const BG = '#2b2d30';
const FG = '#e5e7eb';

async function makeHeader() {
  const width = 150;
  const height = 57;
  const logo = await sharp(logoPath)
    .resize({ width: 120, height: 40, fit: 'inside' })
    .toBuffer();

  await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: BG,
    },
  })
    .composite([
      { input: logo, left: 10, top: Math.floor((height - 40) / 2) },
      { input: Buffer.from(`<svg width="${width}" height="${height}">
        <text x="10" y="${height - 8}" font-size="8" fill="${FG}" font-family="Segoe UI, Arial, sans-serif">OpenReq</text>
      </svg>`), left: 0, top: 0 },
    ])
    .png()
    .toFile(path.join(outputDir, 'installerHeader.png'));
}

async function makeSidebar() {
  const width = 164;
  const height = 314;
  const logo = await sharp(logoPath)
    .resize({ width: 110, height: 110, fit: 'inside' })
    .toBuffer();

  await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: BG,
    },
  })
    .composite([
      { input: logo, left: 16, top: 16 },
      { input: Buffer.from(`<svg width="${width}" height="${height}">
        <text x="16" y="150" font-size="12" fill="${FG}" font-family="Segoe UI, Arial, sans-serif">OpenReq</text>
        <text x="16" y="168" font-size="9" fill="#9ca3af" font-family="Segoe UI, Arial, sans-serif">Desktop Installer</text>
      </svg>`), left: 0, top: 0 },
    ])
    .png()
    .toFile(path.join(outputDir, 'installerSidebar.png'));
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  await makeHeader();
  await makeSidebar();
  console.log('Installer assets generated.');
}

main().catch((err) => {
  console.error('Failed to generate installer assets:', err.message);
  process.exit(1);
});
