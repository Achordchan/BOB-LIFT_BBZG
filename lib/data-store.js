const fs = require('fs');
const shouldProfileDataIo = process.env.BBZG_PROFILE_DATA_IO === '1';

function getData(dataPath) {
  if (shouldProfileDataIo) console.time('数据读取时间');
  const data = fs.readFileSync(dataPath, 'utf8');
  const result = JSON.parse(data);
  if (shouldProfileDataIo) console.timeEnd('数据读取时间');
  return result;
}

function saveData(dataPath, data) {
  if (shouldProfileDataIo) console.time('数据保存时间');
  try {
    fs.writeFileSync(dataPath, JSON.stringify(data));
    if (shouldProfileDataIo) console.timeEnd('数据保存时间');
    return true;
  } catch (error) {
    console.error('保存数据失败:', error);
    if (shouldProfileDataIo) console.timeEnd('数据保存时间');
    return false;
  }
}

module.exports = {
  getData,
  saveData
};
