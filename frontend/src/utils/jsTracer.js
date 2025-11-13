import { runJsCode } from './jsTracer'; // This line is actually not needed inside the file itself, but ensuring the export is correct below.

export function runJsCode(code) {
  const trace = [];
  let stepCount = 0;
  const MAX_STEPS = 1000;

  const initFunc = (interpreter, globalObject) => {
    const logWrapper = (text) => {
      trace.push({
        event: 'output',
        data: text + '\n',
        stack: [], // Ensure stack is present even for output
        heap: {}
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
      
      const node = myInterpreter.stateStack[myInterpreter.stateStack.length - 1].node;
      
      // Capture state on statement-level nodes for better granularity
      if (node.start && node.end && (
          node.type === 'VariableDeclaration' || 
          node.type === 'ExpressionStatement' || 
          node.type === 'ReturnStatement' ||
          node.type === 'ForStatement' ||
          node.type === 'IfStatement' ||
          node.type === 'FunctionDeclaration'
      )) { 
        const snapshot = captureState(myInterpreter, node);
        
        // Filter duplicates based on line number to reduce noise
        const lastSnap = trace[trace.length - 1];
        if (!lastSnap || lastSnap.line_number !== snapshot.line_number) {
           trace.push(snapshot);
        }
      }
    }
  } catch (e) {
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
  
  // Iterate through the stack to build frames
  for (let i = 0; i < stateStack.length; i++) {
    const state = stateStack[i];
    if (state.scope) {
      let funcName = '<global>';
      if (state.func_ && state.func_.name) {
          funcName = state.func_.name;
      } else if (state.func_) {
          funcName = 'anonymous';
      }

      const locals = {};
      
      // Walk the scope chain to get variables accessible in this frame
      let scope = state.scope;
      // We only want the immediate scope for the frame to match Python's behavior
      // However, JS scopes are nested. We'll grab the top-most scope variables.
      if (scope) {
        for (const key in scope.properties) {
          if (key === 'arguments' || key === 'this' || key === 'window' || key === 'console' || key === 'print') continue;
          
          const pseudoVal = scope.properties[key];
          // formatValue updates the heap side-effectfully
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
  
  // Filter out empty frames or internal wrapper frames if necessary
  // For now, we reverse to match the top-down visualizer expectation (Global at top?)
  // Actually, Python tracer puts Global at the bottom of the list in terms of recursion but visualization handles it.
  // Let's stick to the order found: Global is usually 0 in JS interpreter. 
  // Visualization expects: [Global, Function1, Function2...]
  
  return {
    line_number: node.loc ? node.loc.start.line : 0,
    stack: stack,
    heap: heap
  };
}

function formatValue(pseudoVal, heap, interpreter) {
  if (pseudoVal === undefined) return { value: 'undefined' };
  if (pseudoVal === null) return { value: 'null' };

  // Primitives
  if (interpreter.isa(pseudoVal, interpreter.BOOLEAN)) return { value: String(pseudoVal.data) };
  if (interpreter.isa(pseudoVal, interpreter.NUMBER)) return { value: String(pseudoVal.data) };
  if (interpreter.isa(pseudoVal, interpreter.STRING)) return { value: `"${pseudoVal.data}"` };

  // Complex Objects
  if (interpreter.isa(pseudoVal, interpreter.OBJECT)) {
    // Use the object's internal ID if available, or generate one
    const id = pseudoVal.id || String(Math.random()); 
    pseudoVal.id = id; // Persist ID to track object identity across steps

    let type = 'object';
    let value = []; 
    
    if (interpreter.isa(pseudoVal, interpreter.ARRAY)) {
      type = 'list'; // Match Python type name for visualizer compatibility
      const length = pseudoVal.properties.length;
      for (let i = 0; i < length; i++) {
        value.push(formatValue(pseudoVal.properties[i], heap, interpreter));
      }
    } else {
      type = 'dict'; 
      // Extract object properties
      value = {}; // Change to object for dicts
      for (const key in pseudoVal.properties) {
          value[key] = formatValue(pseudoVal.properties[key], heap, interpreter);
      }
    }

    // Only add to heap if not already processed to avoid infinite recursion issues in simple cases
    // (Full circular ref handling would need a 'visited' set in formatValue)
    heap[id] = { type, value };
    return { ref: id };
  }

  return { value: String(pseudoVal) };
}