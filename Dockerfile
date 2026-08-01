FROM node:22-alpine

WORKDIR /app
COPY --chown=node:node . .

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4173

USER node
EXPOSE 4173

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:4173/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
