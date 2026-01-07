(function () {
  async function fetchMusicList() {
    const res = await window.apiRequest('/api/music', { method: 'GET', timeoutMs: 8000 });
    const list = (res && Array.isArray(res.music)) ? res.music : [];
    return list;
  }

  async function fetchInquiryConfig() {
    const res = await window.apiRequest('/api/inquiries/config', { method: 'GET', timeoutMs: 8000 });
    return res;
  }

  async function saveInquiryConfig(addInquiryMusicId, reduceInquiryMusicId) {
    return await window.apiRequest('/api/inquiries/config', {
      method: 'POST',
      timeoutMs: 8000,
      body: JSON.stringify({
        addInquiryMusicId: addInquiryMusicId || null,
        reduceInquiryMusicId: reduceInquiryMusicId || null
      })
    });
  }

  async function deleteMusicById(musicId) {
    const url = `/api/music/delete/${encodeURIComponent(musicId)}`;
    return await window.apiRequest(url, { method: 'DELETE', timeoutMs: 8000 });
  }

  window.MusicModel = {
    fetchMusicList,
    fetchInquiryConfig,
    saveInquiryConfig,
    deleteMusicById
  };
})();
