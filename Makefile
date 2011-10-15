all:
	node src/grammar.js

deps:
	npm install jison underscore interleave

bundle:
	./node_modules/interleave/bin/interleave -o bundled-roy.js interleaved-roy.js

website: all bundle
	[ -e roy.brianmckenna.org ] || mkdir roy.brianmckenna.org
	cp -r site/* roy.brianmckenna.org
	cp -r examples roy.brianmckenna.org
	closure --js bundled-roy.js --js_output_file roy.brianmckenna.org/bundled-roy.js 2>/dev/null || \
		(echo "Closure not available - not minimising" && cp bundled-roy.js roy.brianmckenna.org)

# Tests

test: all
	NODE_PATH=src ./roy -r run-tests.roy
