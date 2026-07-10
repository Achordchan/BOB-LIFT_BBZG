function hasOwn(object, key) {
  return Boolean(object && Object.prototype.hasOwnProperty.call(object, key));
}

function getPageSettingFields(theme) {
  const pageSettings = theme && theme.pageSettings;
  return pageSettings && Array.isArray(pageSettings.fields) ? pageSettings.fields : [];
}

function getSavedThemePageSettings(data, themeId) {
  const themeSettings = data && data.themeSettings;
  const configurations = themeSettings && themeSettings.configurations;
  const configuration = configurations && configurations[themeId];
  return configuration && configuration.pageSettings && typeof configuration.pageSettings === 'object'
    ? configuration.pageSettings
    : null;
}

function resolveThemePageSettings(data, theme) {
  const fields = getPageSettingFields(theme);
  const savedSettings = getSavedThemePageSettings(data, theme && theme.id);
  const legacySettings = data && data.pageSettings && typeof data.pageSettings === 'object'
    ? data.pageSettings
    : null;

  return fields.reduce((settings, field) => {
    if (hasOwn(savedSettings, field.key)) {
      settings[field.key] = String(savedSettings[field.key]);
    } else if (hasOwn(legacySettings, field.key)) {
      settings[field.key] = String(legacySettings[field.key]);
    } else {
      settings[field.key] = field.defaultValue;
    }
    return settings;
  }, {});
}

function saveThemePageSettings(data, theme, submittedSettings) {
  const fields = getPageSettingFields(theme);
  if (!fields.length) {
    const error = new Error('该主题没有可配置的首页文案');
    error.statusCode = 400;
    throw error;
  }

  const input = submittedSettings && typeof submittedSettings === 'object'
    ? submittedSettings
    : {};
  const normalizedSettings = {};

  fields.forEach((field) => {
    const value = hasOwn(input, field.key) ? String(input[field.key]).trim() : '';
    if (field.required && !value) {
      const error = new Error(`${field.label}不能为空`);
      error.statusCode = 400;
      throw error;
    }
    if (value.length > field.maxLength) {
      const error = new Error(`${field.label}不能超过 ${field.maxLength} 个字符`);
      error.statusCode = 400;
      throw error;
    }
    normalizedSettings[field.key] = value;
  });

  const currentThemeSettings = data.themeSettings && typeof data.themeSettings === 'object'
    ? data.themeSettings
    : {};
  const currentConfigurations = currentThemeSettings.configurations
    && typeof currentThemeSettings.configurations === 'object'
    ? currentThemeSettings.configurations
    : {};
  const currentConfiguration = currentConfigurations[theme.id]
    && typeof currentConfigurations[theme.id] === 'object'
    ? currentConfigurations[theme.id]
    : {};
  const updatedAt = new Date().toISOString();

  data.themeSettings = {
    ...currentThemeSettings,
    configurations: {
      ...currentConfigurations,
      [theme.id]: {
        ...currentConfiguration,
        pageSettings: normalizedSettings,
        updatedAt
      }
    }
  };

  return {
    settings: normalizedSettings,
    updatedAt
  };
}

module.exports = {
  getPageSettingFields,
  getSavedThemePageSettings,
  resolveThemePageSettings,
  saveThemePageSettings
};
