FROM node:22.14-alpine

WORKDIR /app
RUN chown node:node /app

USER node

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci

COPY --chown=node:node . .

RUN mkdir -p .cache

EXPOSE 4321

CMD ["npm", "run", "dev:demo", "--", "--host", "0.0.0.0"]
