FROM node:22-slim

WORKDIR /app

# Copy package info and install
COPY package.json ./
RUN npm install

# Copy everything else (including your public folder)
COPY . .

# Expose the port used in index.js
EXPOSE 8000

# Start the application
CMD ["node", "index.js"]
