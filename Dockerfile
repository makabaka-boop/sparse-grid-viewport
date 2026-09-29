# 构建 + 测试一体化镜像：基础镜像自带 Node 20 与 Playwright 浏览器
FROM mcr.microsoft.com/playwright:v1.48.2-jammy

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    CI=1

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

CMD ["npm", "run", "verify"]
