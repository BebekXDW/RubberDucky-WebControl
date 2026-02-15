FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache curl

COPY package*.json ./
RUN npm install

RUN curl -fsS https://dotenvx.sh | sh
ENV PATH="/root/.dotenvx/bin:${PATH}"

COPY . .

EXPOSE 3001

CMD ["dotenvx", "run", "--", "npm", "start"]
