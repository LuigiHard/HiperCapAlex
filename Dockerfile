# Etapa de build
FROM node:20-alpine AS build

WORKDIR /app

ENV NODE_ENV=production

# Copia apenas arquivos de dependência
COPY package*.json ./

# Instala apenas dependências de produção
RUN npm ci --omit=dev

# Copia o restante do código
COPY server.js ./
COPY public ./public

# Etapa final (imagem mais leve)
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

# Copia app e dependências da etapa de build
COPY --from=build /app /app

# Cria usuário não-root para segurança
RUN addgroup -S nodejs && adduser -S nodeuser -G nodejs \
    && chown -R nodeuser:nodejs /app

USER nodeuser

EXPOSE 1337

CMD ["node", "server.js"]
