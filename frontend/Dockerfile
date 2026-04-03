FROM node:18-alpine AS builder

WORKDIR /app

# Accept build-time env vars (React needs them baked in at build)
ARG REACT_APP_API_URL
ARG REACT_APP_WS_URL
ENV REACT_APP_API_URL=$REACT_APP_API_URL
ENV REACT_APP_WS_URL=$REACT_APP_WS_URL

COPY package.json .
RUN npm install --legacy-peer-deps && npm install ajv@^8 --legacy-peer-deps
COPY . .
RUN npm run build

# Serve with Nginx
FROM nginx:1.27-alpine
COPY --from=builder /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
