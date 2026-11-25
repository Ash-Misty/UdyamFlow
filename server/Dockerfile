FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json ./server/package.json
COPY client/package.json ./client/package.json
RUN npm ci --omit=dev
COPY server ./server
ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "server/src/index.js"]
