# Use a Node.js LTS image in a build stage to install dependencies
FROM node:20-alpine AS build

# Set working directory inside the container
WORKDIR /app

# Ensure the environment is set to production
ENV NODE_ENV=production

# Copy dependency definitions
COPY package*.json ./

# Install only production dependencies using npm ci
RUN npm ci --omit=dev

# Copy application source files and environment configuration
COPY server.js ./
COPY public ./public
COPY .env ./

# Final stage: create a lightweight production image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Copy app and dependencies from the build stage
COPY --from=build /app /app

# Create a non-root user for security
RUN addgroup -S nodejs && adduser -S nodeuser -G nodejs \
    && chown -R nodeuser:nodejs /app

# Switch to the non-root user
USER nodeuser

# Expose the port the app runs on
EXPOSE 1337

# Run the Node.js application
CMD ["node", "server.js"]
