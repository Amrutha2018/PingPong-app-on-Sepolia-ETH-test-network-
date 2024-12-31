# Use the official Node.js image as the base image
FROM node:18-alpine

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the entire source code to the container
COPY . .

# Install ts-node globally
RUN npm install -g ts-node typescript

# Command to run your app using ts-node
CMD ["ts-node", "src/main.ts"]
