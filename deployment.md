# Deploying LLM-Checkmate to Render (Free Tier)

This guide walks you through deploying your full-stack application (React Frontend + Node.js Backend) as a single service on Render's free tier.

## 1. Prerequisites
- A GitHub account with this repository pushed.
- A Render account (https://render.com).

## 2. Project Setup (Already Done)
I have already configured your project for deployment:
1.  **Modified `server/index.js`**: It now serves the production build of your React frontend alongside the API.
2.  **Created `package.json` (Root)**: This file orchestrates the installation of dependencies and the building of the frontend.

## 3. Deployment Steps on Render

1.  **Create New Web Service**:
    - Go to your Render Dashboard.
    - Click **"New +"** and select **"Web Service"**.
    - Connect your GitHub repository (e.g., `LLM-Checkmate`).

2.  **Configure Settings**:
    - **Name**: `llm-checkmate` (or any unique name).
    - **Region**: Choose the one closest to your users.
    - **Branch**: `main`.
    - **Root Directory**: Leave this blank (it defaults to the root).
    - **Runtime**: Select `Node`.
    - **Build Command**: `npm install && npm run build`
      *(This command installs backend dependencies, then installs frontend dependencies, and finally builds the frontend assets.)*
    - **Start Command**: `npm start`
      *(This starts the Express server which serves both the API and the React app.)*

3.  **Select Instance Type**:
    - Choose **"Free"**.

4.  **Environment Variables (Optional)**:
    - You generally don't need to set any variables.
    - Render automatically provides the `PORT` variable.
    - If you add API keys later (e.g., for gated Hugging Face models), add them here as `HF_TOKEN`.

5.  **Deploy**:
    - Click **"Create Web Service"**.
    - Wait for the build to complete (it may take 2-3 minutes).

## 4. Verification
Once the deployment is live, Render will provide a URL (e.g., `https://llm-checkmate.onrender.com`).
- Visiting this URL should load your **React Landing Page**.
- API endpoints (like `/api/recommendations`) will function seamlessly on the same domain.

## ⚠️ Important Note (Free Tier)
Render's free tier spins down services after 15 minutes of inactivity. When you visit your site after a break, it might take **~60 seconds** to wake up. This is normal for free hosting.

### 💾 Data Persistence
The backend stores hardware reports from the CLI Agent in **temporary memory**. 
- If the server restarts or goes to sleep (Common on Free Tier), you will need to run `llm-checkmate scan` again to re-sync your hardware profile.
- In a production environment, this would be replaced with a database (like MongoDB or PostgreSQL) for permanent storage.
