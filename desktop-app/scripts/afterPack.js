const path = require('path');
const { rcedit } = require('rcedit');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;

  const exePath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const iconPath = path.join(context.packager.projectDir, 'assets', 'icon.ico');

  console.log(`  • setting icon on ${exePath}`);
  await rcedit(exePath, { icon: iconPath });
  console.log('  • icon set successfully');
};
