const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

function registerUserRoutes(app, deps) {
  const { getData, saveData, uuidv4, upload, baseDir } = deps;

  function sanitizeUserForResponse(user) {
    const safe = { ...(user || {}) };
    if (Object.prototype.hasOwnProperty.call(safe, 'loginPassword')) {
      delete safe.loginPassword;
    }
    safe.hasLogin = !!(safe.loginUsername && (user && user.loginPassword));
    return safe;
  }

  function sanitizeUserForPublicList(user) {
    const safe = sanitizeUserForResponse(user);
    if (Object.prototype.hasOwnProperty.call(safe, 'loginUsername')) {
      delete safe.loginUsername;
    }
    return safe;
  }

  // API: 获取所有用户
  app.get('/api/users', (req, res) => {
    const data = getData();

    // 确保users和music数组存在
    if (!data.users) {
      data.users = [];
    }

    if (!data.music) {
      data.music = [];
    }

    // 处理用户数据，添加音乐名称，并按sortOrder排序
    const users = data.users.map(user => {
      const result = sanitizeUserForPublicList(user);
      if (user.musicId) {
        const music = data.music.find(m => m.id === user.musicId);
        if (music) {
          result.musicName = music.name;
        }
      }
      // 如果没有sortOrder字段，设置为999（排在最后）
      if (typeof result.sortOrder === 'undefined') {
        result.sortOrder = 999;
      }
      return result;
    }).sort((a, b) => {
      // 按sortOrder升序排列
      return a.sortOrder - b.sortOrder;
    });

    res.json({ success: true, users });
  });

  // API: 获取单个用户
  app.get('/api/users/:id', (req, res) => {
    const userId = req.params.id;
    const data = getData();

    const user = data.users.find(user => user.id === userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: '未找到该用户'
      });
    }

    res.json({
      success: true,
      user: sanitizeUserForResponse(user)
    });
  });

  // API: 更新用户信息（包括音乐配置）
  app.put('/api/users/update/:id', (req, res) => {
    const userId = req.params.id;
    const { name, position, musicId, loginUsername, loginPassword } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: '用户ID不能为空'
      });
    }

    const data = getData();

    // 查找用户
    const user = data.users.find(user => user.id === userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '未找到用户'
      });
    }

    // 更新用户基本信息
    if (name) user.name = name;
    if (position) user.position = position;

    if (typeof loginUsername !== 'undefined') {
      const nextUsername = String(loginUsername || '').trim();
      if (!nextUsername) {
        delete user.loginUsername;
        delete user.loginPassword;
      } else {
        const exists = data.users.some(u => u && u.id !== userId && String(u.loginUsername || '').trim() === nextUsername);
        if (exists) {
          return res.status(400).json({
            success: false,
            message: '登录账号已被占用'
          });
        }
        user.loginUsername = nextUsername;
      }
    }

    if (typeof loginPassword !== 'undefined') {
      const nextPassword = String(loginPassword || '');
      if (nextPassword) {
        if (!user.loginUsername) {
          return res.status(400).json({
            success: false,
            message: '请先设置登录账号'
          });
        }
        user.loginPassword = nextPassword;
      }
    }

    // 如果提供了音乐ID，更新用户的音乐配置
    if (musicId) {
      // 查找音乐
      const music = data.music.find(music => music.id === musicId);
      if (!music) {
        return res.status(404).json({
          success: false,
          message: '未找到指定的音乐'
        });
      }

      // 更新用户音乐配置
      user.musicId = musicId;
      user.musicName = music.name;
    }

    user.updatedAt = new Date().toISOString();

    // 保存数据
    saveData(data);

    res.json({
      success: true,
      message: '用户信息已更新',
      user: sanitizeUserForResponse(user)
    });
  });

  // API: 添加用户
  app.post('/api/users/add', (req, res) => {
    const { name, position } = req.body;

    if (!name || !position) {
      return res.status(400).json({
        success: false,
        message: '用户名称和位置不能为空'
      });
    }

    const data = getData();

    // 确保users数组存在
    if (!data.users) {
      data.users = [];
    }

    // 计算新用户的sortOrder（排在最后）
    const maxSortOrder = data.users.length > 0
      ? Math.max(...data.users.map(u => u.sortOrder || 0))
      : 0;

    // 创建新用户
    const newUser = {
      id: uuidv4(),
      name,
      position,
      sortOrder: maxSortOrder + 1,
      createdAt: new Date().toISOString()
    };

    data.users.push(newUser);
    saveData(data);

    res.json({
      success: true,
      message: '用户添加成功',
      user: newUser
    });
  });

  // API: 删除用户
  app.delete('/api/users/delete/:id', (req, res) => {
    const userId = req.params.id;
    const data = getData();

    const userIndex = data.users.findIndex(user => user.id === userId);

    if (userIndex === -1) {
      return res.status(404).json({
        success: false,
        message: '未找到用户'
      });
    }

    // 删除用户
    data.users.splice(userIndex, 1);
    saveData(data);

    res.json({
      success: true,
      message: '用户删除成功'
    });
  });

  // API: 更新用户排序
  app.post('/api/users/update-sort', (req, res) => {
    // 确保用户已登录
    if (!req.session || !req.session.loggedIn) {
      return res.status(401).json({ success: false, message: '未授权访问' });
    }

    const { userId, direction } = req.body;

    if (!userId || !direction || !['up', 'down'].includes(direction)) {
      return res.status(400).json({
        success: false,
        message: '参数错误：需要userId和direction(up/down)'
      });
    }

    const data = getData();

    // 确保users数组存在
    if (!data.users) {
      data.users = [];
    }

    // 为没有sortOrder的用户设置默认值
    data.users.forEach((user, index) => {
      if (typeof user.sortOrder === 'undefined') {
        user.sortOrder = index + 1;
      }
    });

    // 按当前sortOrder排序
    data.users.sort((a, b) => a.sortOrder - b.sortOrder);

    // 找到要移动的用户
    const currentIndex = data.users.findIndex(user => user.id === userId);

    if (currentIndex === -1) {
      return res.status(404).json({
        success: false,
        message: '未找到该用户'
      });
    }

    let targetIndex;

    if (direction === 'up') {
      // 向上移动（sortOrder减小）
      if (currentIndex === 0) {
        return res.status(400).json({
          success: false,
          message: '已经是第一个了'
        });
      }
      targetIndex = currentIndex - 1;
    } else {
      // 向下移动（sortOrder增大）
      if (currentIndex === data.users.length - 1) {
        return res.status(400).json({
          success: false,
          message: '已经是最后一个了'
        });
      }
      targetIndex = currentIndex + 1;
    }

    // 交换两个用户的sortOrder
    const currentUser = data.users[currentIndex];
    const targetUser = data.users[targetIndex];

    const tempSortOrder = currentUser.sortOrder;
    currentUser.sortOrder = targetUser.sortOrder;
    targetUser.sortOrder = tempSortOrder;

    saveData(data);

    res.json({
      success: true,
      message: '排序更新成功'
    });
  });

  // API: 上传用户照片
  app.post('/api/users/:userId/photo', upload.fields([
    { name: 'userPhoto', maxCount: 1 },
    { name: 'userFullPhoto', maxCount: 1 }
  ]), async (req, res) => {
    const userId = req.params.userId;

    try {
      const data = getData();
      const userIndex = data.users.findIndex(u => u.id === userId);

      if (userIndex === -1) {
        // 删除已上传的文件
        if (req.files.userPhoto) {
          fs.unlinkSync(req.files.userPhoto[0].path);
        }
        if (req.files.userFullPhoto) {
          fs.unlinkSync(req.files.userFullPhoto[0].path);
        }
        return res.status(404).json({ success: false, message: '用户不存在' });
      }

      // 处理半身照
      if (req.files.userPhoto) {
        const photoFile = req.files.userPhoto[0];
        const photoCropData = req.body.photoCropData ? JSON.parse(req.body.photoCropData) : null;

        // 检查是否是从Canvas裁剪后上传的图片（文件名检查）
        const isFromCanvas = photoFile.originalname === 'cropped-user-photo.jpg';
        console.log('半身照是否来自Canvas裁剪:', isFromCanvas, photoFile.originalname);

        // 删除旧照片(如果存在)
        if (data.users[userIndex].photoUrl) {
          const oldPhotoPath = path.join(baseDir, 'public', data.users[userIndex].photoUrl.replace('/', path.sep));
          if (fs.existsSync(oldPhotoPath)) {
            try {
              fs.unlinkSync(oldPhotoPath);
            } catch (error) {
              console.error('删除旧照片失败:', error);
            }
          }
        }

        // 如果是来自Canvas的图片，直接调整大小并保存
        if (isFromCanvas) {
          const processedFilename = 'processed-' + path.basename(photoFile.path);
          const processedPath = path.join(path.dirname(photoFile.path), processedFilename);

          try {
            console.log('处理来自Canvas的已裁剪照片:', photoFile.path);

            // 获取图片信息
            const imageInfo = await sharp(photoFile.path).metadata();
            console.log('Canvas图片信息:', imageInfo);

            // 直接调整大小
            await sharp(photoFile.path)
              .rotate() // 仍然使用rotate以处理可能的EXIF方向
              .resize(300, 300)
              .jpeg({ quality: 90 })
              .toFile(processedPath);

            // 删除原文件
            fs.unlinkSync(photoFile.path);

            // 更新用户照片URL
            data.users[userIndex].photoUrl = '/images/users/' + processedFilename;
          } catch (error) {
            console.error('处理Canvas照片失败:', error);
            return res.status(500).json({ success: false, message: '处理Canvas照片失败: ' + error.message });
          }
        }
        // 否则处理服务器端裁剪
        else if (photoCropData) {
          const processedFilename = 'processed-' + path.basename(photoFile.path);
          const processedPath = path.join(path.dirname(photoFile.path), processedFilename);

          try {
            console.log('开始处理照片裁剪，数据:', {
              path: photoFile.path,
              crop: {
                left: Math.round(photoCropData.x),
                top: Math.round(photoCropData.y),
                width: Math.round(photoCropData.width),
                height: Math.round(photoCropData.height)
              },
              outputPath: processedPath
            });

            // 检查文件存在
            if (!fs.existsSync(photoFile.path)) {
              throw new Error('源文件不存在: ' + photoFile.path);
            }

            // 检查目录是否可写
            const dirPath = path.dirname(photoFile.path);
            try {
              fs.accessSync(dirPath, fs.constants.W_OK);
            } catch (err) {
              throw new Error('目录没有写入权限: ' + dirPath);
            }

            // 获取图片信息
            const imageInfo = await sharp(photoFile.path).metadata();
            console.log('图片原始信息:', {
              width: imageInfo.width,
              height: imageInfo.height,
              format: imageInfo.format,
              orientation: imageInfo.orientation
            });

            // 检查裁剪数据是否有效
            const cropX = Math.max(0, Math.round(photoCropData.x));
            const cropY = Math.max(0, Math.round(photoCropData.y));
            let cropWidth = Math.round(photoCropData.width);
            let cropHeight = Math.round(photoCropData.height);

            // 确保裁剪区域不超出图片范围
            if (cropX + cropWidth > imageInfo.width) {
              cropWidth = imageInfo.width - cropX;
            }

            if (cropY + cropHeight > imageInfo.height) {
              cropHeight = imageInfo.height - cropY;
            }

            if (cropWidth <= 0 || cropHeight <= 0) {
              throw new Error(`裁剪区域无效: 宽度或高度小于或等于0`);
            }

            console.log('修正后的裁剪参数:', {
              left: cropX,
              top: cropY,
              width: cropWidth,
              height: cropHeight
            });

            // 使用两步处理：先旋转，再裁剪
            // 1. 先处理旋转
            const rotatedImage = sharp(photoFile.path).rotate();

            // 2. 再处理裁剪和调整大小
            await rotatedImage
              .extract({
                left: cropX,
                top: cropY,
                width: cropWidth,
                height: cropHeight
              })
              .resize(300, 300) // 调整为标准尺寸
              .jpeg({ quality: 90 }) // 设置输出品质
              .toFile(processedPath);

            console.log('照片处理成功:', processedPath);

            // 删除原文件
            fs.unlinkSync(photoFile.path);

            // 确认处理后的文件存在
            if (!fs.existsSync(processedPath)) {
              throw new Error('处理后的文件不存在: ' + processedPath);
            }

            // 更新用户照片URL
            data.users[userIndex].photoUrl = '/images/users/' + processedFilename;
          } catch (error) {
            console.error('处理照片失败（详细）:', {
              error: error.toString(),
              stack: error.stack,
              filePath: photoFile.path,
              processedPath: processedPath,
              cropData: photoCropData
            });

            // 尝试删除可能部分处理的文件
            try {
              if (fs.existsSync(processedPath)) {
                fs.unlinkSync(processedPath);
              }
            } catch (cleanupError) {
              console.error('清理部分处理的文件失败:', cleanupError);
            }

            return res.status(500).json({ success: false, message: '处理照片失败: ' + error.message });
          }
        } else {
          // 没有裁剪数据，直接使用原图并调整大小
          const processedFilename = 'processed-' + path.basename(photoFile.path);
          const processedPath = path.join(path.dirname(photoFile.path), processedFilename);

          try {
            // 获取图片信息以记录日志
            const imageInfo = await sharp(photoFile.path).metadata();
            console.log('直接处理的图片信息:', {
              path: photoFile.path,
              width: imageInfo.width,
              height: imageInfo.height,
              format: imageInfo.format,
              orientation: imageInfo.orientation
            });

            await sharp(photoFile.path)
              .rotate() // 自动根据EXIF信息旋转图片
              .resize(300, 300, { fit: 'cover' })
              .jpeg({ quality: 90 })
              .toFile(processedPath);

            // 删除原文件
            fs.unlinkSync(photoFile.path);

            // 更新用户照片URL
            data.users[userIndex].photoUrl = '/images/users/' + processedFilename;
          } catch (error) {
            console.error('处理照片失败:', error);
            return res.status(500).json({ success: false, message: '处理照片失败' });
          }
        }
      }

      // 处理全身照
      if (req.files.userFullPhoto) {
        const fullPhotoFile = req.files.userFullPhoto[0];
        const fullPhotoCropData = req.body.fullPhotoCropData ? JSON.parse(req.body.fullPhotoCropData) : null;

        // 检查是否是从Canvas裁剪后上传的图片（文件名检查）
        const isFromCanvas = fullPhotoFile.originalname === 'cropped-user-full-photo.jpg';
        console.log('全身照是否来自Canvas裁剪:', isFromCanvas, fullPhotoFile.originalname);

        // 删除旧全身照(如果存在)
        if (data.users[userIndex].fullPhotoUrl) {
          const oldFullPhotoPath = path.join(baseDir, 'public', data.users[userIndex].fullPhotoUrl.replace('/', path.sep));
          if (fs.existsSync(oldFullPhotoPath)) {
            try {
              fs.unlinkSync(oldFullPhotoPath);
            } catch (error) {
              console.error('删除旧全身照失败:', error);
            }
          }
        }

        // 如果是来自Canvas的图片，直接调整大小并保存
        if (isFromCanvas) {
          const processedFilename = 'processed-full-' + path.basename(fullPhotoFile.path);
          const processedPath = path.join(path.dirname(fullPhotoFile.path), processedFilename);

          try {
            console.log('处理来自Canvas的已裁剪全身照:', fullPhotoFile.path);

            // 获取图片信息
            const imageInfo = await sharp(fullPhotoFile.path).metadata();
            console.log('Canvas全身照信息:', imageInfo);

            // 直接调整大小
            await sharp(fullPhotoFile.path)
              .rotate() // 仍然使用rotate以处理可能的EXIF方向
              .resize(400, 600)
              .jpeg({ quality: 90 })
              .toFile(processedPath);

            // 删除原文件
            fs.unlinkSync(fullPhotoFile.path);

            // 更新用户全身照URL
            data.users[userIndex].fullPhotoUrl = '/images/users/' + processedFilename;
          } catch (error) {
            console.error('处理Canvas全身照失败:', error);
            return res.status(500).json({ success: false, message: '处理Canvas全身照失败: ' + error.message });
          }
        }
        // 否则处理服务器端裁剪
        else if (fullPhotoCropData) {
          const processedFilename = 'processed-full-' + path.basename(fullPhotoFile.path);
          const processedPath = path.join(path.dirname(fullPhotoFile.path), processedFilename);

          try {
            console.log('开始处理全身照裁剪，数据:', {
              path: fullPhotoFile.path,
              crop: {
                left: Math.round(fullPhotoCropData.x),
                top: Math.round(fullPhotoCropData.y),
                width: Math.round(fullPhotoCropData.width),
                height: Math.round(fullPhotoCropData.height)
              },
              outputPath: processedPath
            });

            // 检查文件存在
            if (!fs.existsSync(fullPhotoFile.path)) {
              throw new Error('源文件不存在: ' + fullPhotoFile.path);
            }

            // 检查目录是否可写
            const dirPath = path.dirname(fullPhotoFile.path);
            try {
              fs.accessSync(dirPath, fs.constants.W_OK);
            } catch (err) {
              throw new Error('目录没有写入权限: ' + dirPath);
            }

            // 获取图片信息
            const imageInfo = await sharp(fullPhotoFile.path).metadata();
            console.log('全身照原始信息:', {
              width: imageInfo.width,
              height: imageInfo.height,
              format: imageInfo.format,
              orientation: imageInfo.orientation
            });

            // 检查裁剪数据是否有效
            const cropX = Math.max(0, Math.round(fullPhotoCropData.x));
            const cropY = Math.max(0, Math.round(fullPhotoCropData.y));
            let cropWidth = Math.round(fullPhotoCropData.width);
            let cropHeight = Math.round(fullPhotoCropData.height);

            // 确保裁剪区域不超出图片范围
            if (cropX + cropWidth > imageInfo.width) {
              cropWidth = imageInfo.width - cropX;
            }

            if (cropY + cropHeight > imageInfo.height) {
              cropHeight = imageInfo.height - cropY;
            }

            if (cropWidth <= 0 || cropHeight <= 0) {
              throw new Error(`裁剪区域无效: 宽度或高度小于或等于0`);
            }

            console.log('修正后的全身照裁剪参数:', {
              left: cropX,
              top: cropY,
              width: cropWidth,
              height: cropHeight
            });

            // 使用两步处理：先旋转，再裁剪
            // 1. 先处理旋转
            const rotatedImage = sharp(fullPhotoFile.path).rotate();

            // 2. 再处理裁剪和调整大小
            await rotatedImage
              .extract({
                left: cropX,
                top: cropY,
                width: cropWidth,
                height: cropHeight
              })
              .resize(400, 600) // 调整为标准尺寸
              .jpeg({ quality: 90 }) // 设置输出品质
              .toFile(processedPath);

            console.log('全身照处理成功:', processedPath);

            // 删除原文件
            fs.unlinkSync(fullPhotoFile.path);

            // 确认处理后的文件存在
            if (!fs.existsSync(processedPath)) {
              throw new Error('处理后的文件不存在: ' + processedPath);
            }

            // 更新用户全身照URL
            data.users[userIndex].fullPhotoUrl = '/images/users/' + processedFilename;
          } catch (error) {
            console.error('处理全身照失败（详细）:', {
              error: error.toString(),
              stack: error.stack,
              filePath: fullPhotoFile.path,
              processedPath: processedPath,
              cropData: fullPhotoCropData
            });

            // 尝试删除可能部分处理的文件
            try {
              if (fs.existsSync(processedPath)) {
                fs.unlinkSync(processedPath);
              }
            } catch (cleanupError) {
              console.error('清理部分处理的文件失败:', cleanupError);
            }

            return res.status(500).json({ success: false, message: '处理全身照失败: ' + error.message });
          }
        } else {
          // 没有裁剪数据，直接使用原图并调整大小
          const processedFilename = 'processed-full-' + path.basename(fullPhotoFile.path);
          const processedPath = path.join(path.dirname(fullPhotoFile.path), processedFilename);

          try {
            // 获取图片信息以记录日志
            const imageInfo = await sharp(fullPhotoFile.path).metadata();
            console.log('直接处理的全身照信息:', {
              path: fullPhotoFile.path,
              width: imageInfo.width,
              height: imageInfo.height,
              format: imageInfo.format,
              orientation: imageInfo.orientation
            });

            await sharp(fullPhotoFile.path)
              .rotate() // 自动根据EXIF信息旋转图片
              .resize(400, 600, { fit: 'cover' })
              .jpeg({ quality: 90 })
              .toFile(processedPath);

            // 删除原文件
            fs.unlinkSync(fullPhotoFile.path);

            // 更新用户全身照URL
            data.users[userIndex].fullPhotoUrl = '/images/users/' + processedFilename;
          } catch (error) {
            console.error('处理全身照失败:', error);
            return res.status(500).json({ success: false, message: '处理全身照失败' });
          }
        }
      }

      // 保存更新后的数据
      if (saveData(data)) {
        res.json({
          success: true,
          user: data.users[userIndex],
          message: '照片上传成功'
        });
      } else {
        res.status(500).json({ success: false, message: '保存用户照片信息失败' });
      }
    } catch (error) {
      console.error('处理用户照片失败:', error);
      res.status(500).json({ success: false, message: '处理用户照片失败: ' + error.message });
    }
  });
}

module.exports = {
  registerUserRoutes
};
