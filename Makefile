.PHONY: serve
serve:
	open http://localhost:8000/
	python3 -m http.server 8000

.PHONY: lint
lint:
	npx eslint . --fix
