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

.. _strings:

Strings
-------

These behave similar to a Javascript String, but they won't have methods attached to them.
String concatentation is done with the '++' operator.

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

Access array elements with the ``@`` operator::

    roy> [1,2,3] @ 1
    2 : Number

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

This property can be used to write well-typed code that works on object properties::

    roy> let a = {a:100}
    roy> let b = {a:5, b:5}
    roy> let f o = o.a + 6
    roy> f a
    106 : Number
    roy> f b
    11 : Number
    roy> let d = {b:100}
    roy> f d
    Error: Type error: {b: Number} is not {a: Number}

Interoperating with JavaScript
------------------------------

Referring to unknown identifier will assume that the identifier refers
to a native JavaScript global.

For example, you can refer to ``console.log``, something not known
natively to Roy::

    roy> console.log "Hello!"
    Hello!


Using Native types
--------------------

Given Roy's current limitations, you may want to use a Native type sometimes::

    roy> "abc".length
    Error: Parse error on line 2: Unexpected '.'

    roy> (String "abc")
    abc : Native
    roy> (String "abc").length
    3 : Native

Regular Expressions
------------------------------

Roy does not have direct support for regular expressions, including literals like /exp/

To use a regular expression in Roy you need one of the following approaches:

* Have an existing RegExp
* Create a native RegExp using the RegExp constructor
* Invoke match on a Native String, which converts the matching String to a RegExp

::

    roy> (String "abcd").match "a.c"
    ["abc"] : Native

    roy> (RegExp("a.c")).exec 'abcd'
    ["abc"] : Native

If you want, you can try and shorten up RegExp construction::

    roy> let r s = RegExp s
    roy> r "a.c"
    /a.c/ : Native
    roy> r"a.c"
    /a.c/ : Native

    roy> (r"a.c").exec "abcd"
    ["abc"] : Native

.. _Curry-Howard isomorphism: http://en.wikipedia.org/wiki/Curry-Howard_correspondence
.. _structural subtyping: http://en.wikipedia.org/wiki/Structural_type_system
Access array elements with the @ operator
