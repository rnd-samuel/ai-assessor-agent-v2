# CORRECTED DOCKERFILE
FROM node:20-alpine as builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist
EXPOSE 3001
CMD ["concurrently", "-k", "-n", "API,WORKER", "\"node dist/index.js\"", "\"node dist/worker.js\""]