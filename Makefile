all:
	node src/grammar.js

website:
	[ -e roy.brianmckenna.org ] || mkdir roy.brianmckenna.org
	cp -r site/* roy.brianmckenna.org
	cp -r src roy.brianmckenna.org
