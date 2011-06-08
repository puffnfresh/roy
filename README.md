Roy
===

Roy rhymes with "toy" and that's what it is. This is a small functional language that compiles to JavaScript. It has a few main features:

* Damas-Hindley-Milner type inference
* Whitespace significant syntax
* Simple tagged unions
* Pattern matching

It is mainly limited to being a toy because it can't interface with JS completely. Gluing JS semantics with static typing is a hard problem that I'm working on.

Example
---

Input (test.roy):

    let addTwo n =
        n + 2

    console.log (addTwo 40)

Output (test.js):

    "use strict";
    var addTwo = function(n) {return n + 2;};
    console.log(addTwo(40))

Calling `addTwo "test"` will result in a compile-time error.

TODO
---
* Structural typing
* Tail recursion
* Prettify output
