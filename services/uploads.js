const fs = require('fs');
const path = require('path');
const multer = require('multer');

function createUpload(baseDir) {
  const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      let uploadDir;
      if (file.fieldname === 'startupAudioFile' || file.fieldname === 'personalizedAudioFile') {
        uploadDir = path.join(baseDir, 'public', 'music', 'custom');
      } else if (file.fieldname === 'musicFile' || file.fieldname === 'lrcFile' || file.fieldname === 'battleSongFile' || file.fieldname === 'sound') {
        uploadDir = path.join(baseDir, 'public', 'music');
      } else if (file.fieldname === 'userPhoto' || file.fieldname === 'userFullPhoto') {
        uploadDir = path.join(baseDir, 'public', 'images', 'users');
      } else {
        uploadDir = path.join(baseDir, 'public', 'uploads');
      }

      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + ext);
    }
  });

  return multer({
    storage: storage,
    limits: {
      fileSize: 50 * 1024 * 1024,
    },
    fileFilter: function (req, file, cb) {
      if (file.fieldname === 'musicFile' || file.fieldname === 'lrcFile' || file.fieldname === 'battleSongFile' || file.fieldname === 'sound' || file.fieldname === 'startupAudioFile' || file.fieldname === 'personalizedAudioFile') {
        if (file.mimetype.startsWith('audio/') || path.extname(file.originalname).toLowerCase() === '.lrc') {
          cb(null, true);
        } else {
          cb(new Error('不支持的文件类型'));
        }
      } else if (file.fieldname === 'userPhoto' || file.fieldname === 'userFullPhoto') {
        if (file.mimetype.startsWith('image/')) {
          cb(null, true);
        } else {
          cb(new Error('只能上传图片文件'));
        }
      } else {
        cb(null, true);
      }
    }
  });
}

module.exports = {
  createUpload
};
