const fs = require('fs');
const path = require('path');

const THEME_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function createThemeRegistry(options) {
  const themesDir = options && options.themesDir;
  if (!themesDir) {
    throw new Error('缺少主题目录');
  }

  function readTheme(directoryName) {
    if (!THEME_ID_PATTERN.test(directoryName)) return null;

    const directory = path.join(themesDir, directoryName);
    const manifestPath = path.join(directory, 'theme.json');
    if (!fs.existsSync(manifestPath)) return null;

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (!manifest || manifest.id !== directoryName) {
      throw new Error(`主题 ${directoryName} 的 id 与目录名不一致`);
    }
    if (!manifest.name || !manifest.entry) {
      throw new Error(`主题 ${directoryName} 缺少名称或入口文件`);
    }

    const entryPath = path.resolve(directory, manifest.entry);
    const directoryPrefix = `${path.resolve(directory)}${path.sep}`;
    if (!entryPath.startsWith(directoryPrefix) || !fs.existsSync(entryPath)) {
      throw new Error(`主题 ${directoryName} 的入口文件无效`);
    }

    return {
      id: manifest.id,
      name: String(manifest.name),
      description: String(manifest.description || ''),
      version: String(manifest.version || '1.0.0'),
      contractVersion: Number(manifest.contractVersion || 1),
      scene: String(manifest.scene || '通用'),
      previewImage: String(manifest.previewImage || ''),
      isDefault: manifest.isDefault === true,
      entryPath
    };
  }

  function listThemes() {
    if (!fs.existsSync(themesDir)) return [];

    return fs.readdirSync(themesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        try {
          return readTheme(entry.name);
        } catch (error) {
          console.error(`忽略无效主题 ${entry.name}:`, error.message);
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name, 'zh-CN'));
  }

  function getTheme(themeId) {
    const normalizedId = String(themeId || '').trim();
    if (!THEME_ID_PATTERN.test(normalizedId)) return null;
    return listThemes().find((theme) => theme.id === normalizedId) || null;
  }

  function getActiveTheme(data) {
    const configuredId = data && data.themeSettings && data.themeSettings.activeThemeId;
    const configuredTheme = getTheme(configuredId);
    if (configuredTheme) return configuredTheme;

    const themes = listThemes();
    return themes.find((theme) => theme.isDefault) || themes[0] || null;
  }

  function toPublicTheme(theme) {
    if (!theme) return null;
    const { entryPath, ...publicTheme } = theme;
    return publicTheme;
  }

  return {
    listThemes,
    getTheme,
    getActiveTheme,
    toPublicTheme
  };
}

module.exports = {
  createThemeRegistry
};
