FROM node:18-slim

WORKDIR /usr/src/app

# Installation des dépendances pour MariaDB
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000
CMD ["node", "server.js"]