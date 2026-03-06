FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY . .

ENV PORT=28884
EXPOSE 28884

CMD ["node", "server.js"]
