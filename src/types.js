// ## Type variable
//
// A type variable represents an parameter with an unknown type or any
// polymorphic type. For example:
//
//     fun id x = x
//
// Here, `id` has the polymorphic type `'a -> 'a`.
var Variable = function() {
    this.id = Variable.nextId;
    Variable.nextId++;
    this.instance = null;
};
Variable.nextId = 0;
exports.Variable = Variable;
// Type variables should look like `'a`. If the variable has an instance, that
// should be used for the string instead.
Variable.prototype.toString = function() {
    if(!this.instance) {
	return "'" + String.fromCharCode("a".charCodeAt(0) + this.id);
    }
    return this.instance.toString();
};

// ## Base type
//
// Base type for all specific types. Using this type as the prototype allows the
// use of `instanceof` to detect a type variable or an actual type.
var BaseType = function() {
    this.types = [];
};
BaseType.prototype.map = function() {};
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
FunctionType.prototype.constructor = FunctionType;
FunctionType.prototype.name = "Function";
FunctionType.prototype.map = function(f) {
    return this.types.map(f);
};
FunctionType.prototype.toString = function() {
    typeString = this.types.map(function(type) {
        return type.toString();
    }).toString();
    return this.name + "(" + typeString + ")";
};
exports.FunctionType = FunctionType;

var NumberType = function() {};
NumberType.prototype = new BaseType();
NumberType.prototype.constructor = NumberType;
NumberType.prototype.name = "Number";
exports.NumberType = NumberType;

var StringType = function() {};
StringType.prototype = new BaseType();
StringType.prototype.constructor = StringType;
StringType.prototype.name = "String";
exports.StringType = StringType;

var BooleanType = function() {};
BooleanType.prototype = new BaseType();
BooleanType.prototype.constructor = BooleanType;
BooleanType.prototype.name = "Boolean";
exports.BooleanType = BooleanType;

var ArrayType = function() {};
ArrayType.prototype = new BaseType();
ArrayType.prototype.constructor = ArrayType;
ArrayType.prototype.name = "Array";
exports.ArrayType = ArrayType;

var ObjectType = function(props) {
    this.props = props;
};
ObjectType.prototype = new BaseType();
ObjectType.prototype.constructor = ObjectType;
ObjectType.prototype.name = "Object";
ObjectType.prototype.map = function(f) {
    var props = this.props;
    var name;
    for(name in props) {
	props[name] = f(props[name]);
    }
    return props;
};
ObjectType.prototype.getPropertyType = function(prop) {
    return this.props[prop];
};
exports.ObjectType = ObjectType;

var TagNameType = function(name) {
    this.name = name;
};
TagNameType.prototype = new BaseType();
TagNameType.prototype.constructor = TagNameType;
TagNameType.prototype.map = function() {
    return this.name;
};
exports.TagNameType = TagNameType;

var TagType = function(types) {
    this.types = types;
    this.name = types[0].toString();
};
TagType.prototype = new BaseType();
TagType.prototype.constructor = TagType;
TagType.prototype.map = function(f) {
    return this.types.map(f);
};
exports.TagType = TagType;

var UnitType = function() {};
UnitType.prototype = new BaseType();
UnitType.prototype.constructor = UnitType;
UnitType.prototype.name = "Unit";
exports.UnitType = UnitType;

var NativeType = function() {};
NativeType.prototype = new BaseType();
NativeType.prototype.constructor = NativeType;
NativeType.prototype.name = "Native";
exports.NativeType = NativeType;
