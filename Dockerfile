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

# Copy Python requirements and install into a venv (avoids PEP 668 externally-managed-environment)
COPY requirements.txt ./
RUN python3 -m venv /app/venv && \
    /app/venv/bin/pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY . .

# Node spawns this Python for fusion inference (fusionMlService.js reads PYTHON_PATH)
ENV PYTHON_PATH=/app/venv/bin/python3
# PORT default; Northflank/Render set PORT at runtime—server uses process.env.PORT
ENV PORT=5001
EXPOSE 5001

# Start the Node server (Python is invoked by Node via spawn)
CMD ["npm", "start"]
