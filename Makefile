.PHONY: run dev pages deploy test

run:
	node server.js

dev:
	node --watch server.js

pages:
	npx wrangler pages dev

deploy:
	npx wrangler pages deploy --branch master

test:
	node --test
