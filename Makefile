.PHONY: all dev dev-server dev-ui install-server install-ui install help

# Default target runs both services concurrently
all: dev

# Run both the Sinatra Python server and Tauri UI concurrently
dev:
	@echo "Starting Sinatra Server and Tauri Desktop Client..."
	@$(MAKE) -j2 dev-server dev-ui

# Start Sinatra Python FastAPI server via uv
dev-server:
	cd server && uv run python -m src.main

# Start Tauri 2 desktop app dev environment
dev-ui:
	cd player && pnpm tauri dev

# Install / sync dependencies across both workspaces
install-server:
	cd server && uv sync

install-ui:
	cd player && pnpm install

install: install-server install-ui

# Show available commands
help:
	@echo "Sinatra Workspace Commands:"
	@echo "  make dev             - Launch backend and frontend concurrently"
	@echo "  make dev-server      - Run Python server alone"
	@echo "  make dev-ui          - Run Tauri app alone"
	@echo "  make install         - Install dependencies for both subprojects"