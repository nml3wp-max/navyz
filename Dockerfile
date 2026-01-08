# Specify base image
FROM node:22-slim

# Specify working directory
WORKDIR /Oapdmiodj49494i

# Copy package.json 
COPY package.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Expose port 3000
EXPOSE 3000

# Run the app
CMD ["node", "app.js"]
