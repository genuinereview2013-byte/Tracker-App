FROM node:18-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY server.js ./
COPY public ./public

# Data lives in Postgres, not in the container — pass your database
# connection string at run time. The container itself is stateless.
ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
