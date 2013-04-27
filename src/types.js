var _ = require('underscore');

// ### Prune
//
// This will unchain variables until it gets to a type or variable without an
// instance. See `unify` for some details about type variable instances.
var prune = function(type) {
    if(type instanceof Variable && type.instance) {
        type.instance = prune(type.instance);
        return type.instance;
    }
    return type;
};
exports.prune = prune;

// ### Occurs check
//
// These functions check whether the type `t2` is equal to or contained within
// the type `t1`. Used for checking recursive definitions in `unify` and
// checking if a variable is non-generic in `fresh`.
var occursInType = function(t1, t2) {
    t2 = prune(t2);
    if(t2 == t1) {
        return true;
    } else if(t2 instanceof ObjectType) {
        var types = [];
        for(var prop in t2.props) {
            types.push(t2.props[prop]);
        }
        return occursInTypeArray(t1, types);
    } else if(t2 instanceof BaseType) {
        return occursInTypeArray(t1, t2.types);
    }
    return false;
};
exports.occursInType = occursInType;

var occursInTypeArray = function(t1, types) {
    return _.any(types, function(t2) {
        return occursInType(t1, t2);
    });
};

// ## Type variable
//
// A type variable represents an parameter with an unknown type or any
// polymorphic type. For example:
//
//     fun id x = x
//
// Here, `id` has the polymorphic type `#a -> #a`.
var Variable = function(idString) {
    if(!idString) {
        this.id = Variable.nextId;
        Variable.nextId++;
    } else {
        this.id = variableFromString(idString);
    }
    this.instance = null;
};
Variable.nextId = 0;
exports.Variable = Variable;

// ### Fresh type
//
// Getting a "fresh" type will create a recursive copy. When a generic type
// variable is encountered, a new variable is generated and substituted in.
//
// A fresh type is only returned when an identifier is found during analysis.
// See `analyse` for some context.
Variable.prototype.fresh = function(nonGeneric, mappings) {
    if(!mappings) mappings = {};

    var type = prune(this);
    if(!(type instanceof Variable)) {
        return type.fresh(nonGeneric, mappings);
    }

    if(occursInTypeArray(type, nonGeneric)) {
        return type;
    }

    if(!mappings[type.id]) {
        mappings[type.id] = new Variable();
    }
    return mappings[type.id];
};

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
    if(!this.instance) {
        return "#" + variableToString(this.id);
    }
    return this.instance.toString();
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
var BaseType = function() {
    this.types = [];
};
BaseType.prototype.toString = function() {
    return this.name;
};
exports.BaseType = BaseType;

// ## Specific types
//
// A `FunctionType` contains a `types` array. The last element represents the
// return type. Each element before represents an argument type.
var FunctionType = function(types, typeClasses) {
    this.types = types;
    this.typeClasses = typeClasses || [];
};
FunctionType.prototype = new BaseType();
FunctionType.prototype.name = "Function";
FunctionType.prototype.fresh = function(nonGeneric, mappings) {
    if(!mappings) mappings = {};

    var newTypeClasses = _.map(this.typeClasses, function(typeClass) {
        return typeClass.fresh(nonGeneric, mappings);
    });

    return new FunctionType(_.map(this.types, function(t) {
        return t.fresh(nonGeneric, mappings);
    }), newTypeClasses);
};
FunctionType.prototype.toString = function() {
    return this.name + "(" + _.map(this.types, function(type) {
        return type.toString();
    }).join(', ') + ")";
};
exports.FunctionType = FunctionType;

var NumberType = function() {};
NumberType.prototype = new BaseType();
NumberType.prototype.fresh = function() {
    return this;
};
NumberType.prototype.name = "Number";
exports.NumberType = NumberType;

var StringType = function() {};
StringType.prototype = new BaseType();
StringType.prototype.fresh = function() {
    return this;
};
StringType.prototype.name = "String";
exports.StringType = StringType;

var BooleanType = function() {};
BooleanType.prototype = new BaseType();
BooleanType.prototype.fresh = function() {
    return this;
};
BooleanType.prototype.name = "Boolean";
exports.BooleanType = BooleanType;

var ArrayType = function(type) {
    this.type = type;
    this.types = [type];
};
ArrayType.prototype = new BaseType();
ArrayType.prototype.name = "Array";
ArrayType.prototype.fresh = function(nonGeneric, mappings) {
    if(!mappings) mappings = {};
    return new ArrayType(this.type.fresh(nonGeneric, mappings));
};
ArrayType.prototype.toString = function() {
    return '[' + this.type.toString() + ']';
};
exports.ArrayType = ArrayType;

var ObjectType = function(props) {
    this.props = props;
};
ObjectType.prototype = new BaseType();
ObjectType.prototype.name = "Object";
ObjectType.prototype.fresh = function(nonGeneric, mappings) {
    var props = {};
    var name;
    for(name in this.props) {
        props[name] = this.props[name].fresh(nonGeneric, mappings);
    }
    var freshed = new ObjectType(props);
    if(this.aliased) freshed.aliased = this.aliased;
    return freshed;
};
ObjectType.prototype.getPropertyType = function(prop) {
    return this.props[prop];
};
ObjectType.prototype.toString = function() {
    var strs = [];
    var p;
    var n;
    var e;
    for(p in this.props) {
        if (_.isString(p)) {
            // Replace any double quotes by their escaped version.
            // Also replace any escaped single quotes.
            e = p.replace(/"|\\"/g, '\\"').replace(/(\\\\)|\\(')/g, '$1$2');
            // Normalize the string format to double quotes.
            n = e.replace(/^'(.*)'$|^\\"(.*)\\"$/, '"$1$2"');
            strs.push(n + ': ' + this.props[p].toString());
        } else {
            strs.push(p + ': ' + this.props[p].toString());
        }
    }
    return '{' + strs.join(', ') + '}';
};
exports.ObjectType = ObjectType;

var TagNameType = function(name) {
    this.name = name;
};
TagNameType.prototype = new BaseType();
TagNameType.prototype.fresh = function() {
    return new TagNameType(this.name);
};
exports.TagNameType = TagNameType;

var TagType = function(types) {
    this.types = types;
    this.name = types[0].toString();
};
TagType.prototype = new BaseType();
TagType.prototype.fresh = function(nonGeneric, mappings) {
    if(!mappings) mappings = {};
    return new TagType(_.map(this.types, function(t) {
        return t.fresh(nonGeneric, mappings);
    }));
};
TagType.prototype.toString = function() {
    return _.map(this.types, function(t) {
        return t.toString();
    }).join(' ');
};
exports.TagType = TagType;

var UnitType = function() {};
UnitType.prototype = new BaseType();
UnitType.prototype.name = "Unit";
UnitType.prototype.fresh = function() {
    return this;
};
exports.UnitType = UnitType;

var NativeType = function() {};
NativeType.prototype = new BaseType();
NativeType.prototype.name = "Native";
NativeType.prototype.fresh = function() {
    return this;
};
exports.NativeType = NativeType;

var TypeClassType = function(name, type) {
    this.name = name;
    this.type = type;
    this.types = [type];
};
TypeClassType.prototype = new BaseType();
TypeClassType.prototype.fresh = function(nonGeneric, mappings) {
    if(!mappings) mappings = {};
    return new TypeClassType(this.name, this.type.fresh(nonGeneric, mappings));
};
TypeClassType.prototype.toString = function() {
    return this.name + ' ' + this.type.toString();
};
exports.TypeClassType = TypeClassType;
