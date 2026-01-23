FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
RUN npm install

# Bundle app source
COPY . .

# Expose the port defined in main.js
EXPOSE 8000

# Start the bot
CMD [ "npm", "start" ]
