Types
=====

The `Curry-Howard isomorphism`_ states that types are theorems and
programs are proofs. Roy takes the stance of not generating programs
(proofs) if the types (theorems) don't make sense.

This is called static type-checking and is a useful tool for writing
correct programs.

Primitives
----------

Roy implements the same primitive types as JavaScript:

* Number
* Boolean
* String
* Array
* Object

In Roy, Arrays and Objects have special semantics and are composed of
multiple types. We'll separately cover typing of :ref:`arrays` and
typing of :ref:`objects`.

The Read Evaluate Print Loop
----------------------------

Roy has an interactive mode which allows compilation and execution of
code.

The simplest example is a value. Putting in the number ``1`` will
respond back with that same value and its type::

    roy> 1
    1 : Number

We could also give a string of characters::

    roy> "Hello world!"
    Hello world! : String

Or a Boolean::

   roy> true
   true : Boolean

Evaluating expressions will also tell you the type of the result::

    roy> 1 + 1
    2 : Number

Let's make the type-checking fail::

    roy> 1 + "Test"
    Error: Type error: Number is not String

Notice that it doesn't give you an answer to the
expression. JavaScript at this point would instead guess what you
meant and give you an answer of ``"1Test"``.

.. _arrays:

Arrays
------

Arrays are homogeneous, meaning that they can only hold elements of
the same type. For example, we can make an Array of Numbers::

    roy> [1, 2, 3]
    1,2,3 : [Number]

Trying to treat it as a heterogeneous collection will result in a type
error::

    roy> [1, true, 3]
    Error: Type error: Number is not Boolean

.. _objects:

Objects
-------

Objects use `structural subtyping`_. An object is a "subtype" of
another object if it satisfies all of the properties that the other
object has.

An empty object is the supertype of all objects::

    roy> {}
    [object Object] : {}

An object containing a single property is a subtype of only the empty
object::

    roy> {a: 100}
    [object Object] : {a: Number}

Interoperating with JavaScript
------------------------------

Referring to unknown identifier will assume that the identifier refers
to a native JavaScript global.

For example, you can refer to ``console.log``, something not known
natively to Roy::

    roy> console.log "Hello!"
    Hello!

.. _Curry-Howard isomorphism: http://en.wikipedia.org/wiki/Curry-Howard_correspondence
.. _structural subtyping: http://en.wikipedia.org/wiki/Structural_type_system
