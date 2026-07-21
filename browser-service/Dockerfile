FROM mcr.microsoft.com/playwright:v1.61.1-jammy

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY bridge-session-manager.js iframe-policy.js index.js service-auth.js ./

ENV PORT=3100
ENV NODE_ENV=production
EXPOSE 3100

USER pwuser
CMD ["node", "index.js"]
