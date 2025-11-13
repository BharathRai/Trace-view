export function runJsCode(code) {
  const trace = [];
  let stepCount = 0;
  const MAX_STEPS = 5000;

  const initFunc = (interpreter, globalObject) => {
    const logWrapper = (text) => {
      const lastSnap = trace.length > 0 ? trace[trace.length - 1] : { stack: [], heap: {}, line_number: 0 };
      trace.push({
        event: 'output',
        data: text + '\n',
        stack: lastSnap.stack,
        heap: lastSnap.heap,
        line_number: lastSnap.line_number
      });
    };

    interpreter.setProperty(globalObject, 'console', 
      interpreter.nativeToPseudo({ log: logWrapper }));
    interpreter.setProperty(globalObject, 'print', 
      interpreter.createNativeFunction(logWrapper));
  };

  try {
    if (!window.Interpreter) {
        throw new Error("JS-Interpreter not loaded. Check index.html");
    }

    const myInterpreter = new window.Interpreter(code, initFunc);

    while (myInterpreter.step() && stepCount < MAX_STEPS) {
      stepCount++;
      
      if (myInterpreter.stateStack.length === 0) break;

      const node = myInterpreter.stateStack[myInterpreter.stateStack.length - 1].node;
      
      // Capture state on meaningful nodes
      if (node.start && node.end && (
          node.type === 'VariableDeclaration' || 
          node.type === 'ExpressionStatement' || 
          node.type === 'ReturnStatement' ||
          node.type === 'ForStatement' ||
          node.type === 'WhileStatement' || 
          node.type === 'IfStatement' ||
          node.type === 'FunctionDeclaration' ||
          node.type === 'CallExpression' ||
          node.type === 'UpdateExpression' ||  // Added for loops (i++)
          node.type === 'AssignmentExpression' // Added for assignments
      )) { 
        const snapshot = captureState(myInterpreter, node);
        
        const lastSnap = trace[trace.length - 1];
        if (!lastSnap || lastSnap.line_number !== snapshot.line_number) {
           trace.push(snapshot);
        }
      }
    }
  } catch (e) {
    console.error("JS Trace Error:", e);
    trace.push({
      event: 'error',
      error_type: 'RuntimeError',
      error_message: e.toString(),
      stack: [],
      heap: {}
    });
  }

  return trace;
}

function captureState(interpreter, node) {
  const stack = [];
  const heap = {};
  let stateStack = interpreter.stateStack;
  
  // This Map tracks unique function scopes to prevent duplicate frames
  // Key: The Scope Object, Value: The Frame Data
  const uniqueFrames = new Map();

  for (let i = 0; i < stateStack.length; i++) {
    const state = stateStack[i];
    
    if (state.scope) {
      // 1. IDENTIFY THE ROOT FUNCTION SCOPE
      // JS-Interpreter creates nested scopes for blocks. We want the scope of the function.
      // We walk up until we hit the Global Scope or a function boundary.
      let currentScope = state.scope;
      let functionScope = currentScope; // This is the scope identifier for our frame
      
      // Find the scope that actually owns this function execution
      while (currentScope && currentScope !== interpreter.globalScope && !currentScope.object) {
          // In JS-Interpreter, function scopes usually don't have an 'object' property (which acts like a 'with' context)
          // We assume the top-most non-global scope in this chain is our function scope
          // This is a simplification but works for standard function calls.
          functionScope = currentScope; 
          if (currentScope.parent === interpreter.globalScope) break;
          currentScope = currentScope.parent;
      }
      
      // Use global scope if we bubbled all the way up
      if (currentScope === interpreter.globalScope) {
          functionScope = interpreter.globalScope;
      }

      // 2. DETERMINE FUNCTION NAME
      let funcName = 'anonymous';
      if (functionScope === interpreter.globalScope) {
          funcName = 'Global Frame';
      } else if (state.func_ && state.func_.name) {
          funcName = state.func_.name;
      } else if (state.func_ && state.func_.node && state.func_.node.id) {
          funcName = state.func_.node.id.name;
      }

      // 3. COLLECT VARIABLES (Walking UP the chain)
      // We gather variables from the current block scope UP to the function scope
      const locals = {};
      let varWalkScope = state.scope;
      
      while (varWalkScope) {
        for (const key in varWalkScope.properties) {
          if (key === 'arguments' || key === 'this' || key === 'window' || key === 'console' || key === 'print') continue;
          
          // Don't overwrite variables if a child scope already defined them (shadowing)
          if (locals[key] === undefined) {
              const pseudoVal = varWalkScope.properties[key];
              locals[key] = formatValue(pseudoVal, heap, interpreter);
          }
        }
        if (varWalkScope === functionScope || varWalkScope === interpreter.globalScope) break;
        varWalkScope = varWalkScope.parent;
      }

      // 4. CREATE OR UPDATE FRAME
      // We use the functionScope object as the unique key. 
      // This merges multiple states (like 'for' loop blocks) into one Function Frame.
      uniqueFrames.set(functionScope, {
          func_name: funcName,
          lineno: node.loc ? node.loc.start.line : 0,
          locals: locals
      });
    }
  }

  // Convert our unique Map back to an Array for the visualizer
  // JS Maps preserve insertion order, so this keeps the stack order correct (Global -> Main -> Func)
  uniqueFrames.forEach(frame => stack.push(frame));

  return {
    line_number: node.loc ? node.loc.start.line : 0,
    stack: stack, 
    heap: heap
  };
}

function formatValue(pseudoVal, heap, interpreter) {
  if (pseudoVal === undefined) return { value: 'undefined' };
  if (pseudoVal === null) return { value: 'null' };

  if (interpreter.isa(pseudoVal, interpreter.BOOLEAN)) return { value: String(pseudoVal.data) };
  if (interpreter.isa(pseudoVal, interpreter.NUMBER)) return { value: String(pseudoVal.data) };
  if (interpreter.isa(pseudoVal, interpreter.STRING)) return { value: `"${pseudoVal.data}"` };

  if (interpreter.isa(pseudoVal, interpreter.OBJECT)) {
    const id = pseudoVal.id || String(Math.random()); 
    pseudoVal.id = id; 

    let type = 'object';
    let value = []; 
    
    if (interpreter.isa(pseudoVal, interpreter.ARRAY)) {
      type = 'list'; 
      const length = pseudoVal.properties.length;
      for (let i = 0; i < length; i++) {
        value.push(formatValue(pseudoVal.properties[i], heap, interpreter));
      }
    } else {
      type = 'dict'; 
      value = {}; 
      for (const key in pseudoVal.properties) {
          value[key] = formatValue(pseudoVal.properties[key], heap, interpreter);
      }
    }

    heap[id] = { type, value };
    return { ref: id };
  }

  return { value: String(pseudoVal) };
}