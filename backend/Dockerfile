# Start from an official Python base image
FROM python:3.11-slim

# Set the working directory inside the container
WORKDIR /app

# ❗ Install the Graphviz system dependency as the root user
# This is the step that will now succeed
RUN apt-get update && apt-get install -y --no-install-recommends graphviz

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