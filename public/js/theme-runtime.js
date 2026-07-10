(function initializeThemeRuntime() {
  const themeId = document.body && document.body.dataset
    ? document.body.dataset.themeId
    : '';
  const isPreview = window.location.pathname.indexOf('/theme-preview/') === 0;

  window.BBZG_THEME = {
    id: themeId,
    preview: isPreview
  };

  if (isPreview) {
    document.documentElement.classList.add('theme-preview-mode');

    if (window.HTMLMediaElement && window.HTMLMediaElement.prototype) {
      window.HTMLMediaElement.prototype.play = function mutedThemePreviewPlay() {
        this.muted = true;
        return Promise.resolve();
      };
    }
  }

  window.applyMainStreamSnapshotForTheme = function applyMainStreamSnapshotForTheme(snapshot) {
    if (isPreview || !snapshot || typeof snapshot !== 'object') return;

    const theme = snapshot.theme && typeof snapshot.theme === 'object'
      ? snapshot.theme
      : null;
    const activeThemeId = theme && typeof theme.activeThemeId === 'string'
      ? theme.activeThemeId
      : '';

    if (activeThemeId && themeId && activeThemeId !== themeId) {
      window.location.reload();
    }
  };
})();
