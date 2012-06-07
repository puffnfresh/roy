var _ = require('underscore');

// ## Type variable
//
// A type variable represents an parameter with an unknown type or any
// polymorphic type. For example:
//
//     fun id x = x
//
// Here, `id` has the polymorphic type `#a -> #a`.
var Variable = function(idString) {
    this.id = Variable.nextId;
    Variable.nextId++;
};
Variable.nextId = 0;
exports.Variable = Variable;

var toChar = function(n) {
    return String.fromCharCode("a".charCodeAt(0) + n);
};
// Type variables should look like `'a`. If the variable has an instance, that
// should be used for the string instead.
//
// This is just bijective base 26.
var variableToString  = function(n) {
    var a = '';
    if(n >= 26) {
        a = variableToString(n / 26 - 1);
        n = n % 26;
    }
    a += toChar(n);
    return a;
};
Variable.prototype.toString = function() {
    return "#" + variableToString(this.id);
};

var variableFromString = function(vs) {
    return _.reduce(_.map(vs.split(''), function(v, k) {
        return v.charCodeAt(0) - 'a'.charCodeAt(0) + 26 * k;
    }), function(accum, n) {
        return accum + n;
    }, 0);
};

// ## Base type
//
// Base type for all specific types. Using this type as the prototype allows the
// use of `instanceof` to detect a type variable or an actual type.
var BaseType = function() {};
BaseType.prototype.toString = function() {
    return this.name;
};
exports.BaseType = BaseType;

// ## Specific types
//
// A `FunctionType` contains a `types` array. The last element represents the
// return type. Each element before represents an argument type.
var FunctionType = function(types) {
    this.types = types;
};
FunctionType.prototype = new BaseType();
FunctionType.prototype.name = "Function";
FunctionType.prototype.toString = function() {
    return this.name + "(" + _.map(this.types, function(type) {
        return type.toString();
    }).join(', ') + ")";
};
exports.FunctionType = FunctionType;

var NumberType = function() {};
NumberType.prototype = new BaseType();
NumberType.prototype.name = "Number";
exports.NumberType = NumberType;

var StringType = function() {};
StringType.prototype = new BaseType();
StringType.prototype.name = "String";
exports.StringType = StringType;

var BooleanType = function() {};
BooleanType.prototype = new BaseType();
BooleanType.prototype.name = "Boolean";
exports.BooleanType = BooleanType;

var ArrayType = function(type) {
    this.type = type;
};
ArrayType.prototype = new BaseType();
ArrayType.prototype.name = "Array";
ArrayType.prototype.toString = function() {
    return '[' + this.type.toString() + ']';
};
exports.ArrayType = ArrayType;

var ObjectType = function(props) {
    this.props = props;
};
ObjectType.prototype = new BaseType();
ObjectType.prototype.name = "Object";
ObjectType.prototype.getPropertyType = function(prop) {
    return this.props[prop];
};
ObjectType.prototype.toString = function() {
    var strs = [];
    var p;
    for(p in this.props) {
        strs.push(p + ': ' + this.props[p].toString());
    }
    return '{' + strs.join(', ') + '}';
};
exports.ObjectType = ObjectType;

var TagNameType = function(name) {
    this.name = name;
};
TagNameType.prototype = new BaseType();
exports.TagNameType = TagNameType;

var TagType = function(types) {
    this.types = types;
    this.name = types[0].toString();
};
TagType.prototype = new BaseType();
TagType.prototype.toString = function() {
    return _.map(this.types, function(t) {
        return t.toString();
    }).join(' ');
};
exports.TagType = TagType;

var UnitType = function() {};
UnitType.prototype = new BaseType();
UnitType.prototype.name = "Unit";
exports.UnitType = UnitType;

var NativeType = function() {};
NativeType.prototype = new BaseType();
NativeType.prototype.name = "Native";
exports.NativeType = NativeType;

var TypeClassType = function(name, type) {
    this.name = name;
    this.type = type;
};
TypeClassType.prototype = new BaseType();
TypeClassType.prototype.toString = function() {
    return this.name + ' ' + this.type.toString();
};
exports.TypeClassType = TypeClassType;
