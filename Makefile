.PHONY: deps site extension lint test

all:
	./node_modules/.bin/grunt

deps:
	npm install
	npm prune

site: all
	[ -e roy.brianmckenna.org ] || mkdir roy.brianmckenna.org
	cp -r site/* roy.brianmckenna.org
	cp -r examples roy.brianmckenna.org
	cp package.json roy.brianmckenna.org
	cp roy-min.js roy.brianmckenna.org/

extension:
	cp roy-min.js misc/chrome-extension/

# Tests

lint:
	./node_modules/.bin/grunt lint

test:
	./node_modules/.bin/grunt jasmine
