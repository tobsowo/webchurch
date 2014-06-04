/*

 Take a finite trace which is in simple form (eg output of trace.js) and convert into a set of Dimple calls to construct a factor graph.
 Call a dimple solver. (What's the right church abstraction? 'dimple-query'? needs access to traced source, not just thunk though.)
 
 Input langauge (in SSA except that the final var in an 'if' is assigned in each branch):
 assignment: var = function(var, ...)
 conditional: if(var){...; assignment} else {...; assignment}
 evidence: condition(var) | factor(var)
 
 Translation to dimple is pretty straightforward, except that a bunch of information is needed about primitive functions:
    dimpleReturnType maps from a function to the return type, 
    dimpleFactor maps from a function to the corresponding dimple factor function.

 
 overall the translation is something like (using <> as unquote):
 
 header:
    FactorGraph myGraph = new FactorGraph();
 
 dimpleAddVarDecl(“var ab1 = foo(ab2, ab3)”)
    —>
        <dimpleReturnType(“foo”)> ab1 = new <dimpleReturnType(“foo”)>();
        myGraph.addFactor(<dimpleFactor(“foo”)>, ab1, ab2, ab3);
 dimpleEvidence("condition(ab1)")
    ->
        ab1.FixedValue = true;
 dimpleEvidence("factor(ab1)")
    ->
        myGraph.addFactor(<some-dimple-factor-that-just-returns-the-input-value, ab1)>
 
 
 
 
 dimpleReturnType is basically a table mapping functions to dimple types. according to the dimple manual, dimple supports the following types for variables:
    Discrete (i.e. enumerated), 
    Bit (i.e. enum [0,1]), 
    Real, 
    RealJoint (more or less a vector of Reals?),
    FiniteFieldVariable
 
 dimpleFactor has mappings like:
    flip —> Bernoulli
    and -> And
 notes:
    -most dimple built-in factors have church/js equivalents.
    -if we handle church_buitlins and erps we'll get most cases.
    -sometimes the arg patterns mismatch. need to wrap them up.
    -for ERPs without dimple builtins we could wrap up scoring code (or ask dimple team to add them…).
    -are there (common) church/js deterministic functions that don’t have dimple builtins? can we translate to java directly? (is it possible to automatically generate java functions for deterministic parts using Rhino or another js->java compiler?)
 
 treatment for condition and factor statements:
    -factor statements can get directly translated into dimple factor statements. (note we may eventually want to intercept the expression computing score before it gets traced, because otherwise we generate a ton of variables with deterministic dependencies. i don't know how well dimple deals with these.)
    -condition statements translate fixed values of variables: condition(var) --> var.FixedValue = T;
    -directly conditioned erps get that as the var.FixedValue.

 inference and execution:
    how flexible should the dimple solver call be? maybe start by just choosing one, later can pass control args that setup the solver.
    initially we can just generate a source code file which we run with java by system call?
    what's the simplest js<->java glue to use more generally? maybe wrap dimple as an applet and call methods using browser magic?

 
 TODO:
    -Implemeent top level translator. Should we do this from source or AST? Probably AST is more flexible. Can use the structure / functions from trace.js
    -First pass should assume all variables are boolean, only erp is flip, and primitives are: and, or, not. From these can make basic models to test the pipeline.

*/


var escodegen = require('escodegen');
var esprima = require('esprima');

var dimpleCode = ""
function toDimpleFile(line) {
//    console.log(line)
    dimpleCode = dimpleCode + line +"\n"
}

function traceToDimple(code) {
    var ast = esprima.parse(code)
    
    //generate dimple header:
    toDimpleFile("FactorGraph myGraph = new FactorGraph();")
    
    for(var dec in ast.body) {
        switch(ast.body[dec].type) {
                case 'VariableDeclaration':
                    //assume one declarator per declaration.
                    dimpleAddVarDecl(ast.body[dec].declarations[0])
                    break
                case 'ExpressionStatement':
                    //should be final statement which is return value. todo in dimple??
                    break
        }
    }
    
    return dimpleCode
}

//most trace statements will be declarations of the form 'var ab0 = foo(ab1,const);'
function dimpleAddVarDecl(ast) {
    var id = ast.id.name
    var init = ast.init
    var callee = init.callee.name
    //get args, which might each be literal, identifier, or array:
    var args = []
    for(var a in init.arguments) {
        var arg = init.arguments[a]
        switch(arg.type) {
                case 'Literal':
                    args.push(arg.value)
                    break
                
                case 'Identifier':
                    args.push(arg.name)
                    break
                
                case 'ArrayExpression':
                    args.push(["todo:arrays"])
                    break
        }
    }
    
    if(callee=='random') {
        callee = args[0]
        args = args[1]
    }
    
    //Generate Dimple statements
    var d = new DimpleFactor(callee)
    var type = d.type
    var factor = d.factor
    toDimpleFile( type+" "+id+" = new "+type+"();" )
    toDimpleFile( "myGraph.addFactor("+factor+", "+id+","+ args.join(",") +");" )
    
}


var DimpleFactor = function DimpleFactor(fn) {
    
    switch(fn) {
        case 'or':
            this.type = "Bit"
            this.factor = "or" //fixme
            break
            
        case 'wrapped_flip':
            this.type = "Bit"
            this.factor = "Bernoulli" //fixme
            break
            
        case 'condition':
            console.log("need to handle evidence!") //fixme
            break
            
        default:
            throw new Error("Can't yet translate function "+fn+".")
    }
}


                 

module.exports =
{
traceToDimple: traceToDimple
}

