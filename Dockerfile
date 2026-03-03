# Cybershield Backend: Node.js + Python (fusion ML)
# For Render (or any Docker host)

FROM node:20-bookworm-slim

# Install Python 3.11 and pip (slim image has minimal deps)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Symlink for python3 -> python (some scripts expect 'python')
RUN ln -sf /usr/bin/python3 /usr/bin/python

WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./

# Install Node dependencies
RUN npm ci --omit=dev

# Copy backend source
COPY . .

# Install Python ML dependencies (used by fusion inference)
RUN pip3 install --no-cache-dir -r requirements.txt

# Render (and most hosts) set PORT; default 5001 for local
ENV PORT=5001
EXPOSE 5001

# Start the Node server (Python is invoked by Node via spawn)
CMD ["npm", "start"]
