import subprocess
import sys
import os
import signal
import time
import shutil

# Colors
GREEN = "\033[92m"
BLUE = "\033[94m"
RESET = "\033[0m"

def log(msg, color=BLUE):
    print(f"{color}[Voxly Dev] {msg}{RESET}")

def check_env_file(path, example_path):
    if not os.path.exists(path):
        if os.path.exists(example_path):
            log(f"Creating {path} from example...", BLUE)
            shutil.copy(example_path, path)
        else:
            log(f"Warning: {path} and {example_path} not found.", BLUE)

def run_dev():
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    backend_dir = os.path.join(root_dir, "backend")
    frontend_dir = os.path.join(root_dir, "frontend")

    # 1. Check .env
    check_env_file(os.path.join(backend_dir, ".env"), os.path.join(backend_dir, ".env.example"))
    check_env_file(os.path.join(frontend_dir, ".env"), os.path.join(root_dir, ".env.example")) # Frontend env usually simple

    processes = []

    try:
        # 2. Start Backend
        log("Starting Backend (DeepMind) 🧠...", GREEN)
        # Assuming venv is active or deps installed in current env
        # On Windows, we might need to be careful about python executable
        backend_cmd = [sys.executable, "-m", "uvicorn", "app.main:app", "--reload", "--host", "0.0.0.0", "--port", "8000"]
        
        # Check if alembic needs to run? Maybe skipping for "dev" speed, let user run manually if needed.
        # But "ALL set to go" implies setup.
        # Let's run migrations first if verify_migrations flag is passed?
        # For now, just run server.
        
        p_backend = subprocess.Popen(backend_cmd, cwd=backend_dir)
        processes.append(p_backend)

        # 3. Start Frontend
        log("Starting Frontend (The Face) 🎨...", GREEN)
        # Use 'npm.cmd' on Windows, 'npm' on others
        npm_cmd = "npm.cmd" if os.name == "nt" else "npm"
        p_frontend = subprocess.Popen([npm_cmd, "run", "dev"], cwd=frontend_dir)
        processes.append(p_frontend)

        log("🚀 Voxly is running! Press Ctrl+C to stop.", GREEN)
        log("Frontend: http://localhost:3000", BLUE)
        log("Backend: http://localhost:8000/docs", BLUE)

        # Wait for processes
        p_backend.wait()
        p_frontend.wait()

    except KeyboardInterrupt:
        log("\nStopping Voxly...", BLUE)
        for p in processes:
            p.terminate()
        sys.exit(0)
    except Exception as e:
        log(f"Error: {e}", BLUE)
        for p in processes:
            p.kill()
        sys.exit(1)

if __name__ == "__main__":
    run_dev()
