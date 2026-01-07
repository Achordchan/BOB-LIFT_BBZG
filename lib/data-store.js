const fs = require('fs');

function getData(dataPath) {
  console.time('数据读取时间');
  const data = fs.readFileSync(dataPath, 'utf8');
  const result = JSON.parse(data);
  console.timeEnd('数据读取时间');
  return result;
}

function saveData(dataPath, data) {
  console.time('数据保存时间');
  try {
    fs.writeFileSync(dataPath, JSON.stringify(data));
    console.timeEnd('数据保存时间');
    return true;
  } catch (error) {
    console.error('保存数据失败:', error);
    console.timeEnd('数据保存时间');
    return false;
  }
}

module.exports = {
  getData,
  saveData
};
