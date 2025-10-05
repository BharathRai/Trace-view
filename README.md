# Next-Gen Python Tutor ✨

This project is an AI-powered, interactive web application designed to help users understand Python code execution. Inspired by Python Tutor, it provides a step-by-step visualization of the call stack and memory, along with intelligent, AI-driven explanations for errors.

![App Screenshot](path/to/your/screenshot.png) 
*(You should replace this with a screenshot of your running application!)*

---

## 🎯 Core Features

* **Step-by-Step Execution Tracer:** Run Python code and step through it line-by-line, forwards and backwards, to see how the program behaves.
* **Visual Call Stack & Heap:** A dynamic diagram shows the call stack (Frames) and memory (Objects) at every step. It visualizes function calls, local variables, and how variables reference objects in memory using pointers.
* **AI-Powered Error Assistant:** When your code has an error, the application sends it to the Gemini API to get a friendly, human-like explanation of what went wrong and how to fix it.
* **Static AST Visualization:** Generate a static Abstract Syntax Tree (AST) diagram to understand the grammatical structure of your code.

---

## 🛠️ Tech Stack

### Frontend
* **Framework:** React (with Vite)
* **In-Browser Python:** Pyodide (via WebAssembly)
* **Diagrams & Visualization:** React Flow
* **Code Editor:** Monaco Editor
* **Markdown Rendering:** React Markdown

### Backend
* **Framework:** FastAPI (Python)
* **AI Integration:** Google Gemini API
* **AST Generation:** Graphviz
* **Deployment:** Docker, Gunicorn

---

## 🚀 Local Setup and Installation

Follow these instructions to get the project running on your local machine.

### Prerequisites
* [Git](https://git-scm.com/)
* [Node.js](https://nodejs.org/) (v16 or later)
* [Python](https://www.python.org/) (v3.9 or later)

### Installation Guide

1.  **Clone the repository:**
    ```sh
    git clone [https://github.com/your-username/your-repo-name.git](https://github.com/your-username/your-repo-name.git)
    cd your-repo-name
    ```

2.  **Set up the Backend:**
    ```sh
    # Navigate to the backend directory
    cd backend

    # Create a Python virtual environment
    python -m venv .venv

    # Activate the virtual environment
    # On Windows (PowerShell):
    .\.venv\Scripts\Activate.ps1
    # On Mac/Linux (Bash):
    # source .venv/bin/activate

    # Install Python dependencies
    pip install -r requirements.txt
    ```

3.  **Set up the Frontend:**
    ```sh
    # Navigate to the frontend directory from the root
    cd frontend

    # Install Node.js dependencies
    npm install
    ```

4.  **Configure Environment Variables:**
    * In the `/backend` directory, create a new file named `.env`.
    * Add your Google Gemini API key to this file:
        ```
        # backend/.env
        GEMINI_API_KEY="your-secret-key-here"
        ```

### Running the Application

You need to run the backend and frontend simultaneously in two separate terminals.

**➡️ Terminal 1: Start the Backend Server**
```sh
# Navigate to the backend directory
cd backend

# Activate the virtual environment if not already active
.\.venv\Scripts\Activate.ps1

# Start the FastAPI server
uvicorn main:app --reload
```

The backend will be running at `http://127.0.0.1:8000`.

**➡️ Terminal 2: Start the Frontend App**

```sh
# Navigate to the frontend directory
cd frontend

# Start the Vite development server
npm run dev
```

The frontend application will be available at `http://localhost:5173`. Open this URL in your browser to use the application.

-----

## ☁️ Deployment

This application is configured for deployment on **Render**:

  * The **backend** is deployed as a **Docker**-based Web Service. The `Dockerfile` handles the environment setup, including the installation of Graphviz.
  * The **frontend** is deployed as a **Static Site**, built from the `/frontend` directory.

Environment variables for the API key (`GEMINI_API_KEY`) and the backend URL (`VITE_API_BASE_URL`) are configured in the Render dashboard.

