Roy
===

Roy is a small functional language that compiles to JavaScript. It has a few main features:

* Damas-Hindley-Milner type inference
* Whitespace significant syntax
* Compile-time meta-programming
* Simple tagged unions
* Pattern matching
* Structural typing
* Monad syntax
* Not-horrible JS output

Usage
---

To compile:

    make deps
    make

To enter a REPL:

    ./roy

To compile and run a `.roy` file:

    ./roy -r examples/helloworld.roy

To compile a `.roy` file to `.js`:

    ./roy examples/helloworld.roy
    cat examples/helloworld.js

Example
---

Input (test.roy):

    let addTwo n =
        n + 2

    console.log (addTwo 40)

Output (test.js):

    var addTwo = function(n) {
	return n + 2;
    }
    console.log(addTwo(40))

Calling `addTwo "test"` will result in a compile-time error.

See the examples directory for more.

TODO
---
* Mutable types
* Type aliases
* Types across modules
* Allow explicit types that have type parameters
* Standard libary
* Tail recursion
* Use Interleave instead of hacking up a bundler: https://github.com/DamonOehlman/interleave
