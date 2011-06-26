all:
	node src/grammar.js

website: all
	[ -e roy.brianmckenna.org ] || mkdir roy.brianmckenna.org
	cp -r site/* roy.brianmckenna.org
	cp -r examples roy.brianmckenna.org
	cp -r src roy.brianmckenna.org

# Tests

test/%.js: test/%.roy
	./roy $<

test/%.out: test/%.js
	node $< > $@

test: all \
      test/primitive_types.out \
      test/tagged_unions.out
