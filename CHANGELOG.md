## Roy Change Log

### 0.2.2
##### 2013-06-29

* Fix #182: TypeError: Cannot set property 'leadingComments' of undefined

### 0.2.1
##### 2013-06-29

* Fix #180: Support for scientific notated numbers?
* Fix evaluation of Roy code on website.
* Move jison from dependencies to devDependencies.

### 0.2.0
##### 2013-06-29

* **BREAKING CHANGE** Removed metaprogramming.
* **BREAKING CHANGE** Changed array accessor from `!` to `@`.

* Compiler rewritten as proper AST using escodegen.
* New test suite.
* Replaced interleaved with rigger.
* Started using codemirror on the site.

* Added boolean not `!`.
* Added CompileSpec, TarjanSpec and TypeInferenceSpec to test suite.
* Added dependencies (escodegen, source-map).
* Added devDependencies (grunt, jasmine-node, rigger).
* Added documentation for array access.
* Added grunt support.
* Added module (vim-roy).
* Added scientific notation support.
* Added shebang.
* Added strings as keys for objects.
* Added tests (match_expression_single_eval, monoid, object).
* Added travis support.
* Added type classes.

* Removed devDependencies (interleave).
* Removed example (macro).
* Removed meta-programming example from site.

* Updated dependencies (jison, unicode-categories).
* Updated examples (defferedmonad, option).
* Updated miscellaneous (chrome-extension, roy-mode, roy.tmbundle).
* Updated prelude (nil, leftMonad, rightMonad).

### 0.1.5
##### 2012-03-19

* Fixed typo in introduction documentation.

* Added examples (module, node_module).
* Added files (module, macroexpand, typegrammar).
* Added module example to site.
* Added strings, object type example, native types and regex to types documentation.
* Added tests (accessors, coercing_native_to_any, conditionals, where).

* Updated examples (data, option, structural).
* Updated grammar (generic, function types, where).
* Updated prelude (π).
* Updated tests (deep_matching, tagged_unions).

### 0.1.4
##### 2012-01-23
* **BREAKING CHANGE** lambda syntax `\[args] -> <body>` instead of `fn [args] = <body>`.
* **BREAKING CHANGE** do syntax `<bound name> <- <expr>` instead of `bind <bound name> = <expr>`.

* New features
    * Optional type parameter lists for arguments.

* Color console for repl.
* Conversion from mercurial to git.
* Converted examples to new lambda style (funcs, option, structural).
* Converted tests to new syntax (functions, trace_monad).
* Help in repl and binary.
* Makefile supports extensions.
* Renamed stdlib to prelude and extended.
* Started documentation (index, introduction, types).

* Added ajax and deferred examples to site.
* Added chrome extension.
* Added dependencies (unicode-categories).
* Added examples (ajaxmonad, deferredmonad, fizzbuzz, sqrt, tracemonad).
* Added MIT license.
* Added tests (map, option_monad, unicode).

* Updated devDependencies (interleave).
* Updated examples (data, types).
* Updated roy-mode and roy.tmbundle extensions.

### 0.1.3
##### 2011-11-19

* Specific `jison` version.
* Fixed fall-through bug in repl.

### 0.1.2
##### 2011-11-18

* New features
    * Compile-time meta-programming.
    * Simple tagged unions.
    * Pattern matching.
    * Structural typing.
    * Monad syntax.
    * Not-horrible JS output.

* Move from toy language to full fledged language.

* Added examples (alias, data, macro, option, stdlib, structural).
* Added stdlib.
* Added website.
* Added test suite (deep_matching, functions, primitive_types, tagged_unions, trace_monad).

* Updated examples (funcs, types).
