// 全局变量
window.audioSystemInitialized = false;
window.userHasInteracted = false;

// 在页面加载时清除之前的所有sessionStorage和localStorage值
sessionStorage.removeItem('audioSystemInitialized');
sessionStorage.removeItem('audioSystemInitializedPlayedPrompt');
sessionStorage.removeItem('userHasInteracted');
localStorage.removeItem('audioSystemInitialized');
localStorage.removeItem('audioSystemInitializedPlayedPrompt');
localStorage.removeItem('userHasInteracted');

// 获取音频元素
const inquirySound = document.getElementById('inquirySound');
const deleteSound = document.getElementById('deleteSound');
const dealSound = document.getElementById('dealSound');

// 获取成交金额元素
const dealAmountElement = document.getElementById('dealAmount');
const announcementContainer = document.getElementById('announcementContainer');
const announcementText = document.getElementById('announcementText');

// 用户成交音乐播放器
const userDealSound = document.getElementById('userDealSound');
// 定义audioPlayer变量，使用userDealSound作为播放器
const audioPlayer = userDealSound;

// 记录上一次的询盘数量和成交金额
let lastInquiryCount = null;
let lastDealAmount = null;

// 音乐播放器元素
const musicPlayer = document.getElementById('musicPlayer');
const musicTitle = document.getElementById('musicTitle');
const musicArtist = document.getElementById('musicArtist');
const musicAlbumArt = document.getElementById('musicAlbumArt');
const musicWaves = document.getElementById('musicWaves');
const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');
const currentTimeEl = document.getElementById('currentTime');
const durationEl = document.getElementById('duration');
const playPauseButton = document.getElementById('playPauseButton');
const prevButton = document.getElementById('prevButton');
const nextButton = document.getElementById('nextButton');
const volumeSlider = document.getElementById('volumeSlider');
const volumeLevel = document.getElementById('volumeLevel');
const volumeIcon = document.getElementById('volumeIcon');

// 庆祝动画数据
let celebrationData = null;
let celebrationAnimationTimers = [];

// 播放状态
let isPlaying = false;


// 移除页面加载完成的重复事件监听，这部分在init.js中已经定义
// 保留一些init.js中没有的初始化代码
document.addEventListener('DOMContentLoaded', function() {
  // 初始隐藏音乐波形
  updateMusicWaves(false);
  
  // 初始化音量
  if (audioPlayer) {
    volumeLevel.style.width = `${audioPlayer.volume * 100}%`;
    updateVolumeIcon(audioPlayer.volume);
  }
  
  // 初始化时隐藏控制条
  toggleMusicPlayer(false);
  
  // 初始化时隐藏歌词容器
  const lyricsContainer = document.getElementById('lyricsContainer');
  if (lyricsContainer) {
    lyricsContainer.classList.remove('show');
  }
});

// 调试入口已移除
window.testSpeech = function(text) {
  if (!text) text = "这是一条测试语音，看看是否能正常播放。如果您听到这条语音，说明系统工作正常！";
  speakText(text);
};
window.resetAudioSystem = function() {
  // 移除sessionStorage中的标志
  sessionStorage.removeItem('audioSystemInitialized');
  sessionStorage.removeItem('audioSystemInitializedPlayedPrompt');
  sessionStorage.removeItem('userHasInteracted');
  
  // 重置内存中的标志
  window.audioSystemInitialized = false;
  window.userHasInteracted = false;
  
  console.log('已重置音频系统初始化状态，刷新页面后将重新显示权限请求');
  
  // 提示用户刷新页面
  const message = document.createElement('div');
  message.style.position = 'fixed';
  message.style.top = '20px';
  message.style.left = '50%';
  message.style.transform = 'translateX(-50%)';
  message.style.backgroundColor = '#FF5722';
  message.style.color = 'white';
  message.style.padding = '10px 20px';
  message.style.borderRadius = '4px';
  message.style.zIndex = '1000';
  message.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
  message.textContent = '音频系统已重置，请刷新页面以重新初始化';
  
  document.body.appendChild(message);
  
  // 3秒后自动移除
  setTimeout(() => {
    if (message.parentNode) {
      message.parentNode.removeChild(message);
    }
  }, 5000);
  
  return '音频系统已重置，请刷新页面以重新初始化';
}; 