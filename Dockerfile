# Container image for the Virtual Try-On app.
#
# Render deploys this app with its native Node runtime (see DEPLOY.md), so this
# file is only used for container-based hosts (Fly.io, Cloud Run, self-hosted).
# Keep the Node version in step with the `engines` field in package.json.

FROM node:22-alpine

RUN apk add --no-cache openssl

WORKDIR /app
EXPOSE 3000

# Install ALL dependencies first — the Remix/Vite build needs devDependencies.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Drop dev-only packages after building to keep the runtime image small.
RUN npm remove @shopify/cli && npm prune --omit=dev && npm cache clean --force

ENV NODE_ENV=production

# Runs prisma generate + migrate deploy, then starts the server.
CMD ["npm", "run", "docker-start"]
