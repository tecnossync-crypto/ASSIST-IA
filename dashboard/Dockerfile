FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

# NEXT_PUBLIC_* se hornean en el bundle en build time, no en runtime.
ARG NEXT_PUBLIC_EMPRESA_ID
ENV NEXT_PUBLIC_EMPRESA_ID=$NEXT_PUBLIC_EMPRESA_ID
ARG BACKEND_URL
ENV BACKEND_URL=$BACKEND_URL
ARG NEXT_PUBLIC_BACKEND_PUBLIC_URL
ENV NEXT_PUBLIC_BACKEND_PUBLIC_URL=$NEXT_PUBLIC_BACKEND_PUBLIC_URL
ARG NEXT_PUBLIC_VOICE_WS_URL
ENV NEXT_PUBLIC_VOICE_WS_URL=$NEXT_PUBLIC_VOICE_WS_URL
# Ambiente ("qa" muestra el aviso de pruebas) y versión desplegada (hash del commit).
ARG NEXT_PUBLIC_ENTORNO
ENV NEXT_PUBLIC_ENTORNO=$NEXT_PUBLIC_ENTORNO
ARG NEXT_PUBLIC_APP_VERSION
ENV NEXT_PUBLIC_APP_VERSION=$NEXT_PUBLIC_APP_VERSION

RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
