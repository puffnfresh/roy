module.exports = function(grunt) {
    grunt.initConfig({
        lint: {
            src: [
                './src/*.js'
            ]
        },
        jison: {
            './lib/typeparser.js': './src/typegrammar.js',
            './lib/parser.js': './src/grammar.js'
        },
        rigger: {
            'roy.js': 'rigger-roy.js'
        },
        jasmine: {
            src: './test'
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
        }
    });

    grunt.registerMultiTask('jison', 'Parser generator by jison.', function() {
        var Parser = require('jison').Parser,
            grammar = require(this.data).grammar;
            parser = new Parser(grammar, {debug: true}),
            fs = require('fs');

        fs.writeFileSync(this.target, parser.generate());
    });

    grunt.registerMultiTask('rigger', 'File concatentation by rigger.', function() {
        var rigger = require('rigger'),
            fs = require('fs'),
            done = this.async(),
            target = this.target;

        rigger(this.data, function(err, output) {
            if(err) return grunt.log.error(err);
            fs.writeFileSync(target, output);
            done(true);
        });
    });

    // Watching the task doesn't work. Sadly jasmine-node
    // executeSpecsInFolder is not idempotent
    grunt.registerMultiTask('jasmine', 'Testing by jasmine.', function() {
        var path = require('path'),
            specDir = this.file.src,
            badCache = grunt.file.expand(specDir).concat([
                path.dirname(require.resolve("jasmine-node")),
            ]),
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
            'specFolders': [specDir],
            'onComplete': onComplete,
            'isVerbose': false,
            'showColors': true
        });
    });

    grunt.registerTask('default', 'jison lint jasmine rigger min');
};
