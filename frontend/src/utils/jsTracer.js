export function runJsCode(code) {
  const trace = [];
  let stepCount = 0;
  const MAX_STEPS = 2000;

  const initFunc = (interpreter, globalObject) => {
    const logWrapper = (text) => {
      const lastSnap = trace.length > 0 ? trace[trace.length - 1] : { stack: [], heap: {} };
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
    const myInterpreter = new window.Interpreter(code, initFunc);

    while (myInterpreter.step() && stepCount < MAX_STEPS) {
      stepCount++;
      
      if (myInterpreter.stateStack.length === 0) break;

      const node = myInterpreter.stateStack[myInterpreter.stateStack.length - 1].node;
      
      if (node.start && node.end && (
          node.type === 'VariableDeclaration' || 
          node.type === 'ExpressionStatement' || 
          node.type === 'ReturnStatement' ||
          node.type === 'ForStatement' ||
          node.type === 'WhileStatement' ||
          node.type === 'IfStatement' ||
          node.type === 'FunctionDeclaration' ||
          node.type === 'CallExpression'
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
  
  for (let i = 0; i < stateStack.length; i++) {
    const state = stateStack[i];
    if (state.scope) {
      let funcName = '<global>';
      if (state.func_ && state.func_.name) {
          funcName = state.func_.name;
      } else if (state.func_) {
          funcName = 'anonymous'; // Often the main wrapper in JS-Interpreter
      }

      // In JS-Interpreter, the 'global' scope often appears as an anonymous function wrapper
      // We can rename it for clarity if it's the root
      if (i === 0 && funcName === 'anonymous') {
          funcName = '<global>';
      }

      const locals = {};
      let scope = state.scope;
      
      if (scope) {
        for (const key in scope.properties) {
          if (key === 'arguments' || key === 'this' || key === 'window' || key === 'console' || key === 'print') continue;
          
          const pseudoVal = scope.properties[key];
          const formatted = formatValue(pseudoVal, heap, interpreter);
          locals[key] = formatted;
        }
      }

      stack.push({
        func_name: funcName,
        lineno: node.loc ? node.loc.start.line : 0,
        locals: locals
      });
    }
  }
  
  // --- FIX: Reverse the stack order to match Python tracer ---
  // The Python tracer puts the oldest frame (Global) at index 0.
  // JS-Interpreter builds it that way too, but let's ensure we filter empty frames.
  const filteredStack = stack.filter(frame => Object.keys(frame.locals).length > 0 || frame.func_name === '<global>');

  return {
    line_number: node.loc ? node.loc.start.line : 0,
    stack: filteredStack, // Pass the stack directly
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