Introduction
============

Roy is a programming language that targets JavaScript. It has a few
main features:

* Damas-Hindley-Milner type inference
* Whitespace significant syntax
* Simple tagged unions
* Pattern matching
* Structural typing
* Monad syntax
* Not-horrible JS output

Most of these features are common in statically-typed, functional
languages, such as:

* Haskell_
* OCaml_
* Scala_

Why JavaScript?
---------------

JavaScript is a necessity for web applications. It is the only
feasible language you can natively run in your web browser.

A lot of developers are now using JavaScript outside of the browser;
you can use `node.js`_ and Rhino_ to write server-side JavaScript.

What not just write JavaScript?
-------------------------------

As universal as JavaScript has become, the language itself has
problems:

Boilerplate
***********

Creating functions is something that functional programmers want to do
but JavaScript makes this a bit too verbose:

.. code-block:: javascript

    var x = function(a, b, c){
      return a + b + c;
    };

One solution would be to come up with a shorthand syntax for functions
and have implicit returns. We might also be able to get rid of those
braces.

Tolerance
*********

JavaScript tries to guess what the developer is trying to do:

.. code-block:: javascript

    var two = 1 + true;
    console.log(two == "2"); // true

It doesn't really make sense to add the number ``1`` to the Boolean
``true`` value. It doesn't really make sense to compare the number
``2`` to the string ``"2"``.

For correctness, we should show an error instead of trying to guess
what the programmer wants.

Complexity
**********

JavaScript allows multiple ways to do the same thing. Which is the
correct way to construct a Person?

.. code-block:: javascript

    var p1 = Person();
    var p2 = new Person();

It depends on the library and can be a source of confusion.

Dangerous
*********

It can be easy to do things with unintentional
side-effects. JavaScript has the ``var`` keyword to create local
variables but unqualified assignments write to the global object:

.. code-block:: javascript

    var x = 10;

    function getX() {
      x = 100; // forgot 'var'
      return x;
    }

    console.log(getX()); // 100
    console.log(x); // 100

What can we do?
---------------

We've identified some problems with JavaScript, what can we do to fix
it?

* Try to replace JavaScript in the browser with another language
* Try to replace JavaScript in the browser with a general purpose
  bytecode
* Change the JavaScript standard
* Compile from another language to JavaScript

The last option is the path of least resistance. In fact, there's
already `quite a few languages`_ that compile to JavaScript, the most
popular being CoffeeScript_, haXe_ and Objective-J_.

There also ways to compile Haskell, OCaml and Scala to
JavaScript. These can help with writing statically-typed, functional
code for the browser but they usually have a few downsides:

* Hard/impossible to interoperate with JavaScript libraries
* Generate a lot of code
* Generate code that requires a hefty runtime
* Must be compiled on the server-side (not in the browser)

The Roy solution
----------------

After trying to write correct programs in JavaScript and languages
that compile to JavaScript, Roy was created. Roy tries to keep close
to JavaScript semantics for ease of interoperability and code
generation. It's also written in JavaScript so that it can compile
code from the browser.

One of the biggest ideas when coming from JavaScript is the use of
compile-time type-checking to remove type errors. We'll cover that in
the next chapter.

.. _node.js: http://nodejs.org/
.. _Rhino: http://www.mozilla.org/rhino/
.. _Haskell: http://haskell.org/
.. _OCaml: http://caml.inria.fr/
.. _Scala: http://scala-lang.org/
.. _quite a few languages: http://altjs.org/
.. _CoffeeScript: http://coffeescript.org/
.. _haXe: http://haxe.org/
.. _Objective-J: http://cappuccino.org/
