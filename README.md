# Fotography AI - Duplicate Photo Detector with AI Culling

Fotography AI is a privacy-first, offline duplicate photo detector that helps you manage your photo library. It can identify exact duplicate images using SHA-256 hashing, find perceptually similar images using pHash, and even leverage AI for culling images based on quality metrics. The project consists of a Python backend and a React frontend.

## Features

*   **Exact Duplicate Detection**: Identifies images that are byte-for-byte identical using SHA-256 hashing.
*   **Perceptual Duplicate Detection**: Finds visually similar images even if they have minor differences (e.g., compression, slight edits, crops) using pHash.
*   **AI Culling**: Utilizes a local LLaVA model (via Ollama) to evaluate image quality (sharpness, exposure, subject presence, composition, emotion) and suggest which images to keep or delete.
*   **Web UI**: A React-based frontend for easy interaction and visualization of duplicate groups and AI culling results.
*   **Offline Operation**: All processing happens locally on your machine; no data leaves your system.

## Prerequisites

To run this project, you will need:

*   **Devbox**: Used to manage the development environment and dependencies (Node.js, Python, Git, FFmpeg).
*   **Ollama**: Required for the AI Culling feature to run the LLaVA model locally. Ensure Ollama is installed and the `llava` model is pulled (`ollama pull llava`).

## Setup

1.  **Install Devbox**: Follow the instructions on the [Devbox website](https://www.jetpack.io/devbox/docs/installing-devbox/) to install Devbox.
2.  **Install Ollama**: Download and install Ollama from the [Ollama website](https://ollama.com/download).
    *   **Using Homebrew (macOS/Linux)**:
        ```bash
        brew install ollama
        ollama serve # Start the Ollama service
        ```
    *   **Using Docker Compose**:
        Create a `docker-compose.yml` file (e.g., in `fotography_ai/open-webui/compose.yml` as seen in your project structure, or a new one):
        ```yaml
        version: '3.8'
        services:
          ollama:
            image: ollama/ollama:latest
            ports:
              - "11434:11434"
            volumes:
              - ollama_data:/root/.ollama
            restart: always
        volumes:
          ollama_data:
        ```
        Then run:
        ```bash
        docker-compose up -d
        ```
3.  **Pull LLaVA Model**: Once Ollama is installed, pull the LLaVA model by running the following command in your terminal:
    ```bash
    ollama pull llava
    ```
4.  **Clone the Repository**: If you haven't already, clone the `fotography_ai` repository to your local machine.
    ```bash
    git clone <repository_url>
    cd fotography_ai
    ```
5.  **Initialize Devbox Environment**: Navigate to the `fotography_ai` directory and initialize the Devbox environment. This will install all necessary dependencies (Node.js, Python, etc.).
    ```bash
    devbox shell
    ```
    You should see output indicating that the Devbox AI environment is ready.

## Running the Application

Once the Devbox environment is set up, you can start the backend and frontend services.

1.  **Start Services**: From within the `devbox shell`, run the following command:
    ```bash
    devbox run start
    ```
    This command will concurrently start:
    *   The Python Flask backend (`dupescope-backend/server.py`) on `http://127.0.0.1:5000`.
    *   The React development server for the frontend (`dupescope-ui`) on `http://localhost:5173` (or another available port).

    You can also start them individually:
    *   **Backend only**: `devbox run backend`
    *   **Frontend only**: `devbox run frontend`

2.  **Access the UI**: Open your web browser and navigate to the address provided by the frontend (usually `http://localhost:5173`).

## Usage

1.  **Specify Folder**: In the web UI, enter the path to the folder containing the images you want to scan.
2.  **Select Mode**: Choose your desired detection mode:
    *   **Exact**: Finds byte-for-byte identical duplicates.
    *   **Perceptual**: Finds visually similar images. You can adjust the `threshold` for sensitivity.
    *   **Both**: Runs both exact and perceptual detection.
    *   **AI Culling**: (Requires Ollama and LLaVA model) Evaluates images based on quality metrics.
3.  **Start Scan**: Click the "Scan" button to begin the process.
4.  **Review Results**: The UI will display groups of duplicate or similar images, and for AI culling, it will show suggested images to keep or delete.

## Project Structure

*   `dupescope-backend/`: Contains the Python Flask backend for image scanning and duplicate detection.
    *   `server.py`: The Flask application that exposes API endpoints for scanning.
    *   `dupescope.py`: Core logic for SHA-256 hashing, pHash calculation, and AI culling integration.
*   `dupescope-ui/`: The React frontend application.
*   `devbox.json`: Devbox configuration file, defining the development environment and scripts.
*   `dupescope_report.json`: (Generated) Output file for scan reports.

## Devbox Commands

Here are the `devbox` commands defined in `devbox.json`:

*   `devbox shell`: Enters the Devbox environment, installing necessary packages.
*   `devbox run start`: Starts both the backend and frontend concurrently.
*   `devbox run backend`: Starts only the Python Flask backend.
*   `devbox run frontend`: Starts only the React frontend development server.
