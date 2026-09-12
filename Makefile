IMAGE   := testapi-app:latest
CONTAINER := testapi-app
VOLUME  := testapi-app-data
PORT    ?= 3000

.PHONY: build run stop start logs ps clean test

build: ## Build the image with podman
	podman build --format docker -t $(IMAGE) .

run: build ## Build (if needed) and start the container
	podman rm -f $(CONTAINER) 2>/dev/null || true
	podman run -d --name $(CONTAINER) --restart unless-stopped \
		-p $(PORT):3000 -v $(VOLUME):/app/data $(IMAGE)

start: ## Start the existing container
	podman start $(CONTAINER)

stop: ## Stop the container
	podman stop $(CONTAINER)

logs: ## Follow container logs
	podman logs -f $(CONTAINER)

ps: ## Show container status
	podman ps --format '{{.Names}}\t{{.Status}}\t{{.Ports}}'

test: ## Smoke test the running app
	@curl -fsS http://localhost:$(PORT)/api/health && echo
	@curl -fsS -X POST http://localhost:$(PORT)/api/auth/login \
		-H 'Content-Type: application/json' \
		-d '{"username":"mike1","password":"Mypassword1"}' \
		| python3 -c 'import json,sys; print("login mike1: OK, token:", json.load(sys.stdin)["token"][:12] + "...")'

clean: ## Stop and remove the container (data volume kept)
	podman rm -f $(CONTAINER) 2>/dev/null || true
