all:
	node src/grammar.js

deps:
	npm install jison

bundle:
	node make-bundle.js

website: all bundle
	[ -e roy.brianmckenna.org ] || mkdir roy.brianmckenna.org
	cp -r site/* roy.brianmckenna.org
	cp -r examples roy.brianmckenna.org
	cp bundled-roy.js roy.brianmckenna.org

# Tests

test/%.js: test/%.roy
	./roy $<

test/%.out: test/%.js
	node $< > $@

test: all \
      test/primitive_types.out \
      test/tagged_unions.out
