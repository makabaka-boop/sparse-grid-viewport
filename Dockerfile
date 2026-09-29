# 运行/测试一体化镜像：Playwright 官方镜像自带浏览器与系统依赖
FROM mcr.microsoft.com/playwright:v1.47.2-jammy

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

CMD ["npm", "run", "verify"]
