module.exports = function(grunt) {
    grunt.initConfig({
        lint: {
            src: ['./src/*.js']
        },
        jison: {
            './lib/typeparser.js': './src/typegrammar.js',
            './lib/parser.js': './src/grammar.js'
        },
        cjsify: {
            'roy.js': {
                entry: 'src/compile.js',
                dir: __dirname,
                options: {
                    'export': 'roy',
                    'ignoreMissing': true,
                    'node': false
                }
            }
        },
        jasmine: {
            specs: {
                src: './test',
                cache: ['./test', './src']
            }
        },
        min: {
            'roy-min.js': 'roy.js'
        },
        watch: {
            parsers: {
                files: './src/*grammar.js',
                tasks: 'jison'
            },
            jasmine: {
                files: ['./src/*.js', './test/*Spec.js'],
                tasks: 'jasmine'
            }
        },
        jshint: {
            options: {
                es3: true,
                indent: 4,
                noarg: true,
                node: true,
                trailing: true,
                undef: true,
                unused: true
            }
        }
    });

    grunt.registerMultiTask('jison', 'Parser generator by jison.', function() {
        var Parser = require('jison').Parser,
            grammar = require(this.data).grammar;
            parser = new Parser(grammar, {debug: grunt.option('debug')}),
            fs = require('fs');

        fs.writeFileSync(this.target, parser.generate());
    });

    grunt.registerMultiTask('cjsify', 'Bundling by commonjs-everywhere.', function() {
        var cjsify = require('commonjs-everywhere').cjsify,
            escodegen = require('escodegen'),
            target = this.target,
            ast = cjsify(this.data.entry, this.data.dir, this.data.options),
            output = escodegen.generate(ast);

        grunt.file.write(target, output);
    });

    grunt.registerMultiTask('jasmine', 'Testing by jasmine.', function() {
        var path = require('path'),
            specDir = this.file.src,
            badCache = grunt.utils._.map(this.data.cache || [], function(p) { return path.resolve(p); }),
            jasmine,
            done = this.async(),
            key;

        // Would be nice to use grunt.file.clearRequireCache
        grunt.utils._.each(require.cache, function(v, k) {
            var isBad = grunt.utils._.any(badCache, function(dir) {
                return k.indexOf(path.resolve(dir)) === 0;
            });
            if(!isBad) return;
            delete require.cache[k];
        });

        jasmine = require("jasmine-node");

        // Not nice (necessary for jasmine-node's asyncSpecWait, etc)
        for(key in jasmine) if(jasmine[key] instanceof Function) global[key] = jasmine[key];

        function onComplete(runner) {
            if (runner.results().failedCount > 0) {
                process.exit(1);
                return;
            }
            done(true);
        };

        jasmine.executeSpecsInFolder({
            specFolders: [specDir],
            regExpSpec: /.*Spec\.js/,
            onComplete: onComplete,
            isVerbose: true,
            showColors: true
        });
    });

    grunt.registerTask('default', 'jison lint jasmine cjsify min');
};
