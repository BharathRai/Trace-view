# Start from an official Python base image
FROM python:3.11-slim

# Set the working directory inside the container
WORKDIR /app

# ❗ Install the Graphviz system dependency and C++ tools (gcc, g++, gdb)
# This is required for C++ tracing and AST visualization
RUN apt-get update && apt-get install -y --no-install-recommends \
    graphviz \
    build-essential \
    gdb

# Copy your Python dependencies file
COPY requirements.txt .

# Install the Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of your backend application code into the container
COPY . .

# Expose the port Render will use
EXPOSE 10000

# Command to run your application using Gunicorn
CMD ["gunicorn", "-w", "4", "-k", "uvicorn.workers.UvicornWorker", "main:app", "--bind", "0.0.0.0:10000"]