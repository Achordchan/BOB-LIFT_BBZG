// 音乐播放器的显示/隐藏控制
function toggleMusicPlayer(show) {
  const musicPlayer = document.getElementById('musicPlayer');
  if (!musicPlayer) {
    console.error("找不到musicPlayer元素");
    return;
  }
  
  if (show && !musicPlayer.classList.contains('show')) {
    musicPlayer.classList.add('show');
    updateMusicWaves(true);
  } else if (!show && musicPlayer.classList.contains('show')) {
    musicPlayer.classList.remove('show');
    updateMusicWaves(false);
  }
}

// 更新波形动画
function updateMusicWaves(playing) {
  if (playing) {
    musicWaves.style.display = 'flex';
    // 确保波形动画显示
    const waves = musicWaves.querySelectorAll('.music-wave');
    waves.forEach(wave => {
      wave.style.animationPlayState = 'running';
    });
  } else {
    // 可以选择暂停波形动画而不是隐藏
    const waves = musicWaves.querySelectorAll('.music-wave');
    waves.forEach(wave => {
      wave.style.animationPlayState = 'paused';
    });
    // 或者完全隐藏
    musicWaves.style.display = 'none';
  }
}

// 更新播放按钮图标
function updatePlayPauseButton(playing) {
  playPauseButton.innerHTML = playing ? '⏸️' : '▶️';
}

// 播放用户配置的音乐
function playUserMusic(musicToPlay, callback) {
  if (!userDealSound) {
    if (typeof callback === 'function') callback();
    return;
  }
  
  // 如果musicToPlay为null，尝试获取默认的战歌
  if (!musicToPlay) {
    console.log('未指定播放音乐，尝试检查是否有默认战歌');
    
    // 直接获取默认战歌，而不是依赖最近一次成交信息
    fetch('/api/defaultBattleSong/public')
      .then(response => response.json())
      .then(data => {
        if (data.success && data.defaultBattleSong) {
          console.log('获取到默认战歌，开始播放');
          // 构建音乐对象并播放
          const defaultMusic = data.defaultBattleSong;
          const musicObj = {
            musicId: defaultMusic.id,
            musicName: defaultMusic.name,
            musicFile: defaultMusic.filename,
            userName: '系统默认战歌',
            userPosition: '默认战歌'
          };
          // 使用获取到的默认战歌递归调用
          playUserMusic(musicObj, callback);
        } else {
          console.log('没有默认战歌或获取失败，跳过播放');
          if (typeof callback === 'function') callback();
        }
      })
      .catch(error => {
        console.error('获取默认战歌失败:', error);
        if (typeof callback === 'function') callback();
      });
    return;
  }
  
  // 确保停止任何其他可能正在播放的音频
  // 停止所有可能正在播放的音频
  const allAudios = [inquirySound, deleteSound, dealSound];
  allAudios.forEach(audio => {
    if (audio && !audio.paused) {
      audio.pause();
      audio.currentTime = 0;
    }
  });
  
  // 如果当前正在播放，先暂停并重置
  if (!userDealSound.paused) {
    userDealSound.pause();
  }
  userDealSound.currentTime = 0;
  
  // 设置音乐源
  const audioSource = userDealSound.querySelector('source');
  const oldSrc = audioSource.src;
  
  const newSrc = `/music/${musicToPlay.musicFile}`;
  
  // 如果源相同，不重新加载
  if (oldSrc === newSrc) {
    userDealSound.currentTime = 0;
  } else {
    audioSource.src = newSrc;
    // 设置preload为auto，确保预加载
    userDealSound.setAttribute('preload', 'auto');
    // 重新加载音频
    userDealSound.load();
  }
  
  // 设置为低音量以避免移动设备的自动播放限制
  userDealSound.volume = 0.7;
  
  console.log(`正在播放用户 ${musicToPlay.userName} 的成交音乐: ${musicToPlay.musicName}`);
  
  // 更新音乐控制条信息
  musicTitle.textContent = musicToPlay.musicName || '未知歌曲';
  musicArtist.textContent = `${musicToPlay.userName} (${musicToPlay.userPosition || '未知职位'})`;
  
  // 添加庆祝模式类到body
  document.body.classList.add('celebration-mode');
  
  // 检查是否有LRC歌词
  if (musicToPlay.musicId) {
    loadLyrics(musicToPlay.musicId);
  }
  
  // 确保音乐控制条可见
  toggleMusicPlayer(true);
  
  // 预先设置状态为播放中
  isPlaying = true;
  updatePlayPauseButton(true);
  updateMusicWaves(true);
  
  // 清除可能存在的结束备份定时器
  if (window.endPlaybackTimeout) {
    clearTimeout(window.endPlaybackTimeout);
    window.endPlaybackTimeout = null;
  }
  
  // 延迟一点时间再播放，确保加载有足够时间
  setTimeout(() => {
    // 尝试播放
    const playPromise = userDealSound.play();
    
    // 处理可能的播放限制
    if (playPromise !== undefined) {
      playPromise.then(() => {
        // 播放成功，恢复音量
        setTimeout(() => {
          userDealSound.volume = 1.0;
          // 立即更新一次进度条和时间显示
          if (userDealSound.duration) {
            durationEl.textContent = formatDuration(userDealSound.duration);
            currentTimeEl.textContent = formatDuration(userDealSound.currentTime);
            updateProgress();
            
            // 设置结束备份定时器 - 如果歌曲播放时间超过预期，强制结束
            if (userDealSound.duration > 0 && userDealSound.duration < 600) { // 只针对10分钟以内的歌曲
              window.endPlaybackTimeout = setTimeout(() => {
                console.log('结束备份定时器触发，强制结束播放');
                if (isPlaying) {
                  forceEndPlayback();
                }
              }, (userDealSound.duration * 1000) + 5000); // 歌曲时长 + 5秒的缓冲
            }
          }
        }, 100);
        
        console.log('用户成交音乐播放成功，确保UI状态更新');
        
        // 设置定时更新进度
        if (!window.progressInterval) {
          window.progressInterval = setInterval(() => {
            updateProgress();
          }, 1000);
        }
        
        // 执行回调，表示音乐开始播放
        if (typeof callback === 'function') callback();
      }).catch(error => {
        console.log('用户成交音乐播放失败:', error);
        
        // 播放失败，更新状态
        isPlaying = false;
        updatePlayPauseButton(false);
        updateMusicWaves(false);
        
        // 检测是否为移动设备
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        
        if (isMobile) {
          console.log('检测到移动设备，尝试解锁音频');
          
          // 创建一个用户交互锁定解除函数，但不触发完整初始化
          const unlockAudio = function() {
            // 在用户交互后尝试再次播放
            userDealSound.play().then(() => {
              console.log('移动设备音频已解锁');
              // 更新播放状态和按钮
              isPlaying = true;
              updatePlayPauseButton(true);
              updateMusicWaves(true);
              
              // 执行回调
              if (typeof callback === 'function') callback();
              
              document.removeEventListener('click', unlockAudio);
              document.removeEventListener('touchstart', unlockAudio);
            }).catch(err => {
              console.log('移动设备音频解锁失败:', err);
              
              // 即使失败也执行回调
              if (typeof callback === 'function') callback();
            });
          };
          
          // 添加用户交互监听
          document.addEventListener('click', unlockAudio, { once: true });
          document.addEventListener('touchstart', unlockAudio, { once: true });
          
          // 显示简化的提示，告知用户需要点击屏幕才能启用音效
          showInteractionNeededMessage();
        } else {
          // 非移动设备也执行回调
          if (typeof callback === 'function') callback();
        }
      });
    } else {
      // 如果playPromise未定义也执行回调
      if (typeof callback === 'function') {
        setTimeout(callback, 100);
      }
    }
  }, 200);
}

// 格式化时间为 mm:ss
function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

// 更新进度条
function updateProgress() {
  if (userDealSound && !isNaN(userDealSound.duration)) {
    // 确保音频确实在播放
    if (!userDealSound.paused) {
      const percent = (userDealSound.currentTime / userDealSound.duration) * 100;
      progressBar.style.width = `${percent}%`;
      currentTimeEl.textContent = formatDuration(userDealSound.currentTime);
      durationEl.textContent = formatDuration(userDealSound.duration);
      
      // 检测是否接近结束但未触发ended事件(距离结束不到1.5秒)
      if (userDealSound.duration > 0 && 
          userDealSound.currentTime > 0 && 
          userDealSound.duration - userDealSound.currentTime < 1.5) {
        console.log('检测到音频接近结束但未触发ended事件，手动触发结束流程');
        // 手动结束播放
        forceEndPlayback();
      }
    }
  }
}

// 强制结束播放函数 - 集中处理所有结束逻辑
function forceEndPlayback() {
  console.log('强制结束播放流程');
  // 确保先暂停音频
  if (userDealSound) {
    userDealSound.pause();
    userDealSound.currentTime = 0;
  }
  
  // 更新所有UI状态
  isPlaying = false;
  updatePlayPauseButton(false);
  updateMusicWaves(false);
  
  // 清除进度更新定时器
  if (window.progressInterval) {
    clearInterval(window.progressInterval);
    window.progressInterval = null;
  }
  
  // 如果有结束备份定时器，也清除它
  if (window.endPlaybackTimeout) {
    clearTimeout(window.endPlaybackTimeout);
    window.endPlaybackTimeout = null;
  }
  
  // 立即更新进度条到起始位置
  progressBar.style.width = '0%';
  currentTimeEl.textContent = formatDuration(0);
  
  // 移除庆祝模式类
  document.body.classList.remove('celebration-mode');
  
  // 隐藏全屏庆祝效果
  hideCelebration();
  
  // 清除庆祝数据
  celebrationData = null;
  
  // ⭐ 通知排队系统：当前成交已完成，可以处理下一个
  console.log('🎵 [强制结束] 通知排队系统处理下一个');
  if (typeof window.dealEndHandler === 'function') {
    window.dealEndHandler();
  }
  
  // 隐藏歌词显示
  const lyricsContainer = document.getElementById('lyricsContainer');
  if (lyricsContainer) {
    lyricsContainer.classList.remove('show');
  }
  
  // 延迟隐藏播放器
  setTimeout(() => {
    if (!isPlaying) {
      toggleMusicPlayer(false);
    }
  }, 2000);
}

// 设置进度条位置
function setProgress(e) {
  const width = progressContainer.clientWidth;
  const clickX = e.offsetX;
  if (userDealSound && !isNaN(userDealSound.duration)) {
    const seekTime = (clickX / width) * userDealSound.duration;
    userDealSound.currentTime = seekTime;
  }
}

// 更新音量图标
function updateVolumeIcon(volume) {
  if (volume === 0) {
    volumeIcon.textContent = '🔇';
  } else if (volume < 0.5) {
    volumeIcon.textContent = '🔉';
  } else {
    volumeIcon.textContent = '🔊';
  }
}

// 播放暂停切换
function togglePlay() {
  if (userDealSound) {
    if (userDealSound.paused) {
      // 尝试播放
      const playPromise = userDealSound.play();
      
      // 处理可能的播放错误
      if (playPromise !== undefined) {
        playPromise.then(() => {
          // 播放成功
          isPlaying = true;
          updatePlayPauseButton(true);
          updateMusicWaves(true);
          
          // 立即更新一次进度
          updateProgress();
          
          // 设置定时更新进度
          if (!window.progressInterval) {
            window.progressInterval = setInterval(() => {
              updateProgress();
            }, 1000);
          }
        }).catch(err => {
          console.log('播放失败:', err);
          isPlaying = false;
          updatePlayPauseButton(false);
          updateMusicWaves(false);
          
          // 清除进度更新定时器
          if (window.progressInterval) {
            clearInterval(window.progressInterval);
            window.progressInterval = null;
          }
        });
      }
    } else {
      // 暂停播放
      userDealSound.pause();
      isPlaying = false;
      updatePlayPauseButton(false);
      updateMusicWaves(false);
      
      // 清除进度更新定时器
      if (window.progressInterval) {
        clearInterval(window.progressInterval);
        window.progressInterval = null;
      }
    }
  }
}

// 设置播放器事件监听
function setupMusicPlayerEvents() {
  playPauseButton.addEventListener('click', togglePlay);
  
  progressContainer.addEventListener('click', function(e) {
    // 获取点击位置相对于进度条的位置
    const rect = progressContainer.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;
    
    if (userDealSound && !isNaN(userDealSound.duration)) {
      const seekTime = (clickX / width) * userDealSound.duration;
      userDealSound.currentTime = seekTime;
    }
  });
  
  volumeSlider.addEventListener('click', function(e) {
    // 获取点击位置相对于音量条的位置
    const rect = volumeSlider.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;
    
    const volume = Math.max(0, Math.min(1, clickX / width));
    
    // 更新音量UI
    volumeLevel.style.width = `${volume * 100}%`;
    
    if (userDealSound) {
      userDealSound.volume = volume;
    }
    
    updateVolumeIcon(volume);
  });
  
  // 上一曲、下一曲按钮
  prevButton.addEventListener('click', () => {
    // 跳转到音频开始位置
    if (userDealSound) {
      userDealSound.currentTime = 0;
    }
  });
  
  nextButton.addEventListener('click', () => {
    // 如果有下一首歌曲的逻辑，在这里实现
    // 当前示例中，点击下一曲相当于结束当前歌曲
    if (userDealSound) {
      userDealSound.currentTime = userDealSound.duration || 0;
    }
  });
  
  // 设置音频事件监听
  if (userDealSound) {
    // 音频播放
    userDealSound.addEventListener('play', () => {
      // 只有当播放的是用户上传的歌曲时才更新UI和显示控制条
      if (userDealSound.src && userDealSound.src.includes('/music/') && !userDealSound.src.endsWith('xunpanluru.mp3') && !userDealSound.src.endsWith('delete.mp3') && !userDealSound.src.endsWith('deal.mp3')) {
        console.log('播放事件触发，更新UI');
        isPlaying = true;
        updatePlayPauseButton(true);
        updateMusicWaves(true);
        toggleMusicPlayer(true);
        
        // 立即更新一次进度和时间显示
        updateProgress();
        
        // 设置定时更新进度
        if (!window.progressInterval) {
          window.progressInterval = setInterval(() => {
            updateProgress();
          }, 1000);
        }
      }
    });
    
    // 音频暂停
    userDealSound.addEventListener('pause', () => {
      // 只有当暂停的是用户上传的歌曲时才更新UI
      if (userDealSound.src && userDealSound.src.includes('/music/') && !userDealSound.src.endsWith('xunpanluru.mp3') && !userDealSound.src.endsWith('delete.mp3') && !userDealSound.src.endsWith('deal.mp3')) {
        console.log('暂停事件触发，更新UI');
        isPlaying = false;
        updatePlayPauseButton(false);
        updateMusicWaves(false);
        
        // 清除进度更新定时器
        if (window.progressInterval) {
          clearInterval(window.progressInterval);
          window.progressInterval = null;
        }
        
        // 如果是播放结束导致的暂停，延迟隐藏播放器
        if (userDealSound.currentTime >= userDealSound.duration) {
          setTimeout(() => {
            if (!isPlaying) {
              toggleMusicPlayer(false);
            }
          }, 2000);
        }
      }
    });
    
    // 音频播放结束
    userDealSound.addEventListener('ended', () => {
      // 只有当结束的是用户上传的歌曲时才更新UI
      if (userDealSound.src && userDealSound.src.includes('/music/') && !userDealSound.src.endsWith('xunpanluru.mp3') && !userDealSound.src.endsWith('delete.mp3') && !userDealSound.src.endsWith('deal.mp3')) {
        console.log('播放结束事件触发，更新UI');
        forceEndPlayback(); // 使用统一的结束处理函数
      }
    });
    
    // 添加timeupdate事件监听器，作为检测播放结束的备份机制
    userDealSound.addEventListener('timeupdate', () => {
      // 只检查用户上传的歌曲
      if (userDealSound.src && userDealSound.src.includes('/music/') && 
          !userDealSound.src.endsWith('xunpanluru.mp3') && 
          !userDealSound.src.endsWith('delete.mp3') && 
          !userDealSound.src.endsWith('deal.mp3')) {
        
        // 检测播放是否接近结束但未结束(距离结束不到1秒)
        if (userDealSound.duration > 0 && 
            userDealSound.currentTime > 0 && 
            userDealSound.duration - userDealSound.currentTime < 1.0) {
          console.log(`timeupdate事件检测到接近结束: ${userDealSound.currentTime}/${userDealSound.duration}`);
          
          // 如果超过95%且小于99.5%的进度，设置一个短暂的定时器来检查是否卡住
          if (userDealSound.currentTime / userDealSound.duration > 0.95 && 
              userDealSound.currentTime / userDealSound.duration < 0.995) {
            
            // 记录当前时间，用于检测是否卡住
            const checkTime = userDealSound.currentTime;
            
            // 设置300ms后检查是否进度有变化
            setTimeout(() => {
              // 如果仍在播放且进度几乎没变，视为卡住
              if (!userDealSound.paused && 
                  Math.abs(userDealSound.currentTime - checkTime) < 0.1) {
                console.log('检测到播放卡住，强制结束播放');
                forceEndPlayback();
              }
            }, 300);
          }
        }
      }
    });
    
    // 音频暂停事件，处理庆祝动画
    userDealSound.addEventListener('pause', () => {
      // 如果是手动暂停（不是播放结束导致的暂停）
      if (userDealSound.currentTime < userDealSound.duration - 0.1) {
        // 暂时隐藏全屏庆祝效果
        if (window.celebrationActive) {
          hideCelebration();
          // 标记是暂停导致的隐藏
          window.celebrationPaused = true;
        }
      }
    });
    
    // 播放事件，用于恢复全屏庆祝效果
    userDealSound.addEventListener('play', () => {
      // 如果是从暂停恢复播放，且之前有庆祝效果
      if (window.celebrationPaused && celebrationData) {
        // 恢复全屏庆祝效果
        resumeCelebration();
        window.celebrationPaused = false;
        
        // 只有在存在歌词数据时才显示歌词容器
        if (window.currentLyrics && window.currentLyrics.length > 0) {
          const lyricsContainer = document.getElementById('lyricsContainer');
          lyricsContainer.classList.add('show');
        }
        
        // 确保庆祝模式激活
        document.body.classList.add('celebration-mode');
      }
    });
  }
}

// 加载LRC歌词
function loadLyrics(musicId) {
  fetch(`/api/music/${musicId}/lrc`)
    .then(response => {
      if (!response.ok) {
        throw new Error('歌词获取失败');
      }
      return response.text();
    })
    .then(lrcText => {
      // 解析LRC歌词
      const lyrics = parseLrc(lrcText);
      if (lyrics && lyrics.length > 0) {
        // 保存歌词数据
        window.currentLyrics = lyrics;
        // 初始化歌词显示
        initLyricsDisplay(lyrics);
      } else {
        // 没有歌词，清除当前歌词数据并隐藏歌词容器
        window.currentLyrics = null;
        const lyricsContainer = document.getElementById('lyricsContainer');
        lyricsContainer.classList.remove('show');
      }
    })
    .catch(error => {
      console.error('获取歌词失败:', error);
      // 获取歌词失败，清除当前歌词数据并隐藏歌词容器
      window.currentLyrics = null;
      const lyricsContainer = document.getElementById('lyricsContainer');
      lyricsContainer.classList.remove('show');
    });
}

// 解析LRC歌词文本
function parseLrc(lrcText) {
  const lines = lrcText.split('\n');
  const result = [];
  const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const match = timeRegex.exec(line);
    if (!match) {
      // 允许没有时间标签的行，直接跳过
      continue;
    }
    
    const minutes = parseInt(match[1]);
    const seconds = parseInt(match[2]);
    const centiseconds = match[3].length === 2 ? 
      parseInt(match[3]) : 
      parseInt(match[3]) / 10;
    const time = minutes * 60 + seconds + centiseconds / 100;
    
    const text = line.substring(match[0].length).trim();
    if (text) { // 只添加有内容的行
      result.push({ time, text });
    }
  }
  
  return result.sort((a, b) => a.time - b.time);
}

// 初始化歌词显示
function initLyricsDisplay(lyrics) {
  const lyricsContainer = document.getElementById('lyricsContainer');
  const lyricsScroll = document.getElementById('lyricsScroll');
  
  // 清空歌词容器
  lyricsScroll.innerHTML = '';
  
  // 如果没有歌词，直接返回
  if (!lyrics || lyrics.length === 0) return;
  
  // 初始只显示第一行歌词作为当前行
  const currentElement = document.createElement('div');
  currentElement.className = 'lyrics-line current';
  currentElement.textContent = lyrics[0].text;
  lyricsScroll.appendChild(currentElement);
  
  // 如果有第二行，显示为下一行
  if (lyrics.length > 1) {
    const nextElement = document.createElement('div');
    nextElement.className = 'lyrics-line next';
    nextElement.textContent = lyrics[1].text;
    lyricsScroll.appendChild(nextElement);
  }
  
  // 显示歌词容器
  lyricsContainer.classList.add('show');
  
  // 监听音频时间更新事件
  if (userDealSound) {
    // 移除旧的监听器
    userDealSound.removeEventListener('timeupdate', updateLyricsPosition);
    // 添加新的监听器
    userDealSound.addEventListener('timeupdate', updateLyricsPosition);
  }
}

// 更新歌词位置
function updateLyricsPosition() {
  if (!window.currentLyrics || !userDealSound) return;
  
  const currentTime = userDealSound.currentTime;
  const lyrics = window.currentLyrics;
  const lyricsScroll = document.getElementById('lyricsScroll');
  
  // 找到当前播放的歌词行
  let currentLineIndex = -1;
  for (let i = lyrics.length - 1; i >= 0; i--) {
    if (currentTime >= lyrics[i].time) {
      currentLineIndex = i;
      break;
    }
  }
  
  // 如果找到当前行
  if (currentLineIndex !== -1) {
    // 清空歌词容器，每次只显示三行
    lyricsScroll.innerHTML = '';
    
    // 添加前一行歌词（如果存在）
    if (currentLineIndex > 0) {
      const prevElement = document.createElement('div');
      prevElement.className = 'lyrics-line prev';
      prevElement.textContent = lyrics[currentLineIndex - 1].text;
      lyricsScroll.appendChild(prevElement);
    }
    
    // 添加当前行歌词
    const currentElement = document.createElement('div');
    currentElement.className = 'lyrics-line current';
    currentElement.textContent = lyrics[currentLineIndex].text;
    lyricsScroll.appendChild(currentElement);
    
    // 添加下一行歌词（如果存在）
    if (currentLineIndex < lyrics.length - 1) {
      const nextElement = document.createElement('div');
      nextElement.className = 'lyrics-line next';
      nextElement.textContent = lyrics[currentLineIndex + 1].text;
      lyricsScroll.appendChild(nextElement);
    }
  }
}

// 将关键函数暴露到全局作用域，确保可以从其他JS文件调用
function exposeMusicPlayerFunctions() {
  window.toggleMusicPlayer = toggleMusicPlayer;
  window.updateMusicWaves = updateMusicWaves;
  window.updatePlayPauseButton = updatePlayPauseButton;
  window.playUserMusic = playUserMusic;
  window.forceEndPlayback = forceEndPlayback;
}

// 在DOMContentLoaded时执行暴露函数
document.addEventListener('DOMContentLoaded', function() {
  exposeMusicPlayerFunctions();
});

// 立即执行暴露函数，以防万一
exposeMusicPlayerFunctions(); 