# syntax=docker/dockerfile:1

# Comments are provided throughout this file to help you get started.
# If you need more help, visit the Dockerfile reference guide at
# https://docs.docker.com/go/dockerfile-reference/

# Want to help us make this template better? Share your feedback here: https://forms.gle/ybq9Krt8jtBL3iCk7

ARG NODE_VERSION=20.17.0

FROM node:20-alpine3.20

# Use production node environment by default.
ENV NODE_ENV production

WORKDIR .

COPY package*.json .
RUN npm install -g npm@11.0.0
RUN npm install -g nodemon
# Run the application as a non-root user.
# Copy the rest of the source files into the image.
COPY . .
USER node

# Expose the port that the application listens on.
EXPOSE 32638
# Run the application.
CMD npm run dev
