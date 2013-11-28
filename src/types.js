var _ = require('underscore');

// ## Type variable
//
// A type variable represents an parameter with an unknown type or any
// polymorphic type. For example:
//
//     fun id x = x
//
// Here, `id` has the polymorphic type `#a -> #a`.
function Variable(id) {
    this.id = id;
}
exports.Variable = Variable;

function toChar(n) {
    return String.fromCharCode("a".charCodeAt(0) + n);
}
// Type variables should look like `'a`.
//
// This is just bijective base 26.
function variableToString(n) {
    var a = '';
    if(n >= 26) {
        a = variableToString(n / 26 - 1);
        n = n % 26;
    }
    a += toChar(n);
    return a;
}
Variable.prototype.toString = function() {
    return "#" + variableToString(this.id);
};

function variableFromString(vs) {
    return _.reduce(_.map(vs.split(''), function(v, k) {
        return v.charCodeAt(0) - 'a'.charCodeAt(0) + 26 * k;
    }), function(accum, n) {
        return accum + n;
    }, 0);
}

// ## Base type
//
// Base type for all specific types. Using this type as the prototype allows the
// use of `instanceof` to detect a type variable or an actual type.
function BaseType() {}
BaseType.prototype.toString = function() {
    return this.name;
};
exports.BaseType = BaseType;

// ## Specific types
//
// A `FunctionType` contains a `types` array. The last element represents the
// return type. Each element before represents an argument type.
function FunctionType(types) {
    this.types = types;
    if(this.types.length > 2) {
        this.types = [this.types[0], new FunctionType(this.types.slice(1))];
    }
}
FunctionType.prototype = new BaseType();
FunctionType.prototype.name = "Function";
FunctionType.prototype.toString = function() {
    return "(" + this.types.join(" -> ") + ")";
};
FunctionType.prototype.argCount = function() {
    var last = this.types[this.types.length-1];
    if(last instanceof FunctionType) {
        return this.types.length + last.argCount() - 1;
    }
    return this.types.length - 1;
};
exports.FunctionType = FunctionType;

function NumberType() {}
NumberType.prototype = new BaseType();
NumberType.prototype.name = "Number";
exports.NumberType = NumberType;

function StringType() {}
StringType.prototype = new BaseType();
StringType.prototype.name = "String";
exports.StringType = StringType;

function BooleanType() {}
BooleanType.prototype = new BaseType();
BooleanType.prototype.name = "Boolean";
exports.BooleanType = BooleanType;

function ArrayType(type) {
    this.type = type;
}
ArrayType.prototype = new BaseType();
ArrayType.prototype.name = "Array";
ArrayType.prototype.toString = function() {
    return '[' + this.type.toString() + ']';
};
exports.ArrayType = ArrayType;

function ObjectType(props) {
    this.props = props;
}
ObjectType.prototype = new BaseType();
ObjectType.prototype.name = "Object";
ObjectType.prototype.getPropertyType = function(prop) {
    return this.props[prop];
};
ObjectType.prototype.toString = function() {
    var strs = [];
    var p;
    var n;
    var e;
    for(p in this.props) {
        if(_.isString(p)) {
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

function RowObjectType(row, props) {
    this.row = row;
    this.props = props;
}
RowObjectType.prototype = new BaseType();
RowObjectType.prototype.toString = function() {
    var strs = [];
    var p;
    for(p in this.props) {
        strs.push(p + ': ' + this.props[p].toString());
    }
    return '{' + this.row.toString() + ' | ' + strs.join(', ') + '}';
};
exports.RowObjectType = RowObjectType;

function TagType(name, vars) {
    this.name = name;
    this.vars = vars;
}
TagType.prototype = new BaseType();
TagType.prototype.toString = function() {
    if(!this.vars.length) return this.name;
    return this.name + ' ' + _.map(this.vars, function(v) {
        return v.toString();
    }).join(' ');
};
exports.TagType = TagType;

function UnitType() {}
UnitType.prototype = new BaseType();
UnitType.prototype.name = "Unit";
exports.UnitType = UnitType;
