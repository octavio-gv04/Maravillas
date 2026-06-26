# Imagen para desplegar el servidor en la nube (Render, Railway, Fly.io, VPS...).
FROM node:20-alpine
WORKDIR /app

# Instala solo dependencias de producción.
COPY package*.json ./
RUN npm install --omit=dev

# Copia el código.
COPY . .

# Los datos compartidos viven en /app/data → monta un volumen persistente ahí.
VOLUME ["/app/data"]

ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]
