.PHONY: site

all:
	node src/grammar.js

deps:
	npm install
	npm prune

bundle:
	./node_modules/interleave/bin/interleave interleaved-roy.js

site: all bundle
	[ -e roy.brianmckenna.org ] || mkdir roy.brianmckenna.org
	cp -r site/* roy.brianmckenna.org
	cp -r examples roy.brianmckenna.org
	cp package.json roy.brianmckenna.org
	$(MAKE) optimise-bundle DEST=roy.brianmckenna.org/

extension:
	$(MAKE) optimise-bundle DEST=misc/chrome-extension/

optimise-bundle:
	closure --js dist/interleaved-roy.js --js_output_file $(DEST)bundled-roy.js 2>/dev/null || \
		(echo "Closure not available - not minimising" && cp dist/interleaved-roy.js $(DEST)bundled-roy.js)

# Tests

test: all
	./roy -r run-tests.roy
