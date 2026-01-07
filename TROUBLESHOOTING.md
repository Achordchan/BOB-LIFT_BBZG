# 生产环境故障排除指南

## 常见的404错误解决方案

### 问题描述
在生产环境中出现以下API端点404错误：
- `GET /api/platforms/targets 404`
- `GET /api/platform-display-settings 404`
- `POST /api/users/update-sort 404`

### 快速诊断

1. **访问健康检查页面**
   ```
   https://你的域名/health-check
   ```
   这个页面会自动检查所有关键API端点的状态。

2. **检查服务器日志**
   在服务器运行时，查看控制台日志是否显示：
   ```
   API请求: GET /api/platforms/targets - 2025-01-XX
   API 404错误: GET /api/platforms/targets
   ```

### 可能的原因和解决方案

#### 1. 服务器代码版本不匹配
**症状：** 所有新增的API端点都返回404
**解决方案：**
```bash
# 更新代码到最新版本
git pull origin main

# 重启服务器
npm start
```

#### 2. Node.js进程没有正确重启
**症状：** 代码已更新但API仍然404
**解决方案：**
```bash
# 强制杀死所有Node进程
pkill -f "node"

# 重新启动
npm start
```

#### 3. PM2管理的进程没有重启
**症状：** 使用PM2时代码更新后API仍然404
**解决方案：**
```bash
# 重启PM2进程
pm2 restart all

# 或者重新加载配置
pm2 reload all
```

#### 4. 端口冲突或进程占用
**症状：** 服务器无法启动或端口被占用
**解决方案：**
```bash
# 检查端口占用
lsof -i :3000

# 杀死占用进程
kill -9 <PID>

# 重新启动
npm start
```

#### 5. 环境变量配置问题
**症状：** 特定功能无法正常工作
**解决方案：**
检查是否正确设置了环境变量：
```bash
# 检查当前环境变量
echo $NODE_ENV
echo $PORT

# 设置生产环境变量
export NODE_ENV=production
export PORT=3000
```

### 调试步骤

#### 第一步：确认服务器状态
```bash
# 检查服务器是否正在运行
ps aux | grep node

# 检查端口是否被监听
netstat -tulpn | grep :3000
```

#### 第二步：查看服务器日志
如果使用PM2：
```bash
pm2 logs
```

如果直接运行：
```bash
# 在服务器目录下运行并查看输出
npm start
```

#### 第三步：测试API端点
```bash
# 测试基础连接
curl -I http://你的域名/

# 测试具体API端点
curl -X GET http://你的域名/api/users
curl -X GET http://你的域名/api/platforms/targets
```

#### 第四步：检查路由注册
如果已登录管理后台：
```bash
curl -X GET http://你的域名/api/debug/routes \
  -H "Cookie: 你的session_cookie"
```

### 预防措施

#### 1. 设置监控脚本
创建一个监控脚本来定期检查API状态：
```bash
#!/bin/bash
# check_api.sh

DOMAIN="你的域名"
APIS=("/api/users" "/api/platforms/targets" "/api/platform-display-settings")

for api in "${APIS[@]}"; do
    response=$(curl -s -o /dev/null -w "%{http_code}" "$DOMAIN$api")
    if [ $response -ne 200 ] && [ $response -ne 401 ]; then
        echo "警告: $api 返回状态码 $response"
        # 发送告警通知
    fi
done
```

#### 2. 自动部署脚本
```bash
#!/bin/bash
# deploy.sh

# 停止服务
pm2 stop all

# 更新代码
git pull origin main

# 安装依赖
npm install

# 重启服务
pm2 start all

# 等待服务启动
sleep 5

# 检查服务状态
curl -f http://localhost:3000/health-check || {
    echo "部署失败，服务无法启动"
    exit 1
}

echo "部署成功"
```

#### 3. 版本控制
在package.json中记录版本：
```json
{
  "version": "2.1.0",
  "scripts": {
    "version-check": "echo $npm_package_version"
  }
}
```

### 联系支持

如果以上解决方案都无法解决问题：

1. 访问 `https://你的域名/health-check` 获取详细状态
2. 收集服务器日志
3. 提供以下信息：
   - Node.js版本 (`node --version`)
   - 错误截图
   - 健康检查页面的结果
   - 服务器日志片段

### 常用命令速查

```bash
# 查看服务状态
systemctl status your-app

# 重启Node.js应用
pm2 restart all

# 查看实时日志
pm2 logs --lines 50

# 检查端口占用
lsof -i :3000

# 测试API连通性
curl -I http://localhost:3000/api/users

# 查看进程
ps aux | grep node

# 强制重启
pkill -f node && npm start
``` 