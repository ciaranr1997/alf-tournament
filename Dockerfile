FROM node:20-alpine

ENV NODE_ENV=production
WORKDIR /usr/src/app

# Copy package files
COPY website/package.json website/package-lock.json* ./

# Install dependencies
RUN npm install --only=production

# Copy the rest of the app (this is just a fallback)
# The volume mount will override this anyway
COPY website/. . 

EXPOSE 3000

# Run the app. 
# NOTE: This won't auto-reload. Use "nodemon server.js" for that.
CMD [ "node", "server.js" ]