FROM mcr.microsoft.com/playwright:v1.61.0-jammy

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY index.js ./

ENV PORT=3100
EXPOSE 3100

USER pwuser
CMD ["node", "index.js"]
