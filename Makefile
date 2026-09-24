.DEFAULT_GOAL := help

PORT = 8894

# ── Help ──────────────────────────────────────────────────────────────────────
.PHONY: help
help:
	@echo ""
	@echo "  make serve    Start dev server → http://localhost:$(PORT)"
	@echo "  make kill     Kill this project's HTTP server"
	@echo "  make test     Run the engine regression suite (Node, no dependencies)"
	@echo "  make pars     Recompute mission pars from the catalog"
	@echo ""

# ── Dev server ────────────────────────────────────────────────────────────────
# scripts/serve.py is http.server plus Cache-Control: no-cache; a plain
# http.server sends only Last-Modified, so browsers keep stale ES modules after
# edits. Falls back to plain http.server outside the monorepo.
.PHONY: serve
serve:
	@echo "Serving → http://localhost:$(PORT)"
	@if [ -f ../../scripts/serve.py ]; then python3 ../../scripts/serve.py $(PORT); else python3 -m http.server $(PORT); fi

# ── Kill ──────────────────────────────────────────────────────────────────────
.PHONY: kill
kill:
	@lsof -ti :$(PORT) | xargs kill 2>/dev/null && echo "Stopped server on port $(PORT)" || echo "No server running on port $(PORT)"

# ── Tests ─────────────────────────────────────────────────────────────────────
# The engine is plain ES modules with no DOM, so Node runs it directly. The
# flag hides Node's notice that js/ has no package.json "type" field; adding
# one would make this folder an npm workspace member of the monorepo root.
NODE_RUN = node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON

.PHONY: test
test:
	@$(NODE_RUN) tests/run.mjs

.PHONY: pars
pars:
	@$(NODE_RUN) tests/pars.mjs
