FROM node:20-alpine

WORKDIR /app

# Install all deps including devDeps (prisma CLI needed for generate + db push)
COPY package*.json ./
RUN npm ci

# Generate Prisma client
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npx prisma generate

# Copy rest of source
COPY . .

COPY entrypoint.sh ./
RUN sed -i 's/\r$//' entrypoint.sh && chmod +x entrypoint.sh

EXPOSE 4000

ENTRYPOINT ["./entrypoint.sh"]
