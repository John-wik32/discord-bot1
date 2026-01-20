# Use Node.js version 22
FROM node:22-slim

# Create the app directory
WORKDIR /app

# Copy package.json and install dependencies
# We don't need package-lock.json for this to work
COPY package.json ./
RUN npm install

# Copy all your project files (index.js, public folder, etc.)
COPY . .

# Tell Koyeb your app uses port 8000
EXPOSE 8000

# The command to start your bot and dashboard
CMD ["node", "index.js"]
