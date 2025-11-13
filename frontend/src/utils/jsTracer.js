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
    if (!window.Interpreter || !window.acorn) {
        throw new Error("JS-Interpreter or Acorn not loaded. Check index.html");
    }

    const variableMap = buildVariableMap(code);
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
          node.type === 'CallExpression' ||
          node.type === 'UpdateExpression' || 
          node.type === 'AssignmentExpression'
      )) { 
        const snapshot = captureState(myInterpreter, node, variableMap);
        
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

function buildVariableMap(code) {
    const map = { '<global>': new Set() };
    try {
        const ast = window.acorn.parse(code, { ecmaVersion: 2020 });
        const visit = (node, scopeName) => {
            if (!node) return;
            if (node.type === 'FunctionDeclaration') {
                const funcName = node.id.name;
                map[funcName] = new Set();
                node.params.forEach(p => map[funcName].add(p.name));
                visit(node.body, funcName);
                return;
            } else if (node.type === 'VariableDeclaration') {
                node.declarations.forEach(dec => {
                    if (dec.id && dec.id.name) map[scopeName].add(dec.id.name);
                });
            }
            for (const key in node) {
                if (key === 'body' && node.type === 'FunctionDeclaration') continue;
                if (node[key] && typeof node[key] === 'object') {
                    if (Array.isArray(node[key])) node[key].forEach(child => visit(child, scopeName));
                    else if (node[key].type) visit(node[key], scopeName);
                }
            }
        };
        visit(ast, '<global>');
    } catch (e) { console.warn("Failed to parse AST:", e); }
    return map;
}

// Helper to get value from specific scope or any parent scope
function getValueFromScopeChain(scope, name, interpreter) {
    let current = scope;
    while (current) {
        if (current.properties && Object.prototype.hasOwnProperty.call(current.properties, name)) {
            return current.properties[name];
        }
        if (current === interpreter.globalScope) break;
        current = current.parent;
    }
    return interpreter.UNDEFINED;
}

function captureState(interpreter, node, variableMap) {
  const stack = [];
  const heap = {};
  let stateStack = interpreter.stateStack;
  const processedScopes = new Set();

  for (let i = 0; i < stateStack.length; i++) {
    const state = stateStack[i];
    
    if (state.scope && state.func_) {
      if (processedScopes.has(state.scope)) continue;
      processedScopes.add(state.scope);

      // 1. FIX NAME RESOLUTION
      let funcName = 'anonymous';
      if (state.func_.name) {
          funcName = state.func_.name;
      } else if (state.func_.node && state.func_.node.id && state.func_.node.id.name) {
          funcName = state.func_.node.id.name;
      }
      if (i === 0) funcName = 'Global Frame';

      const locals = {};
      
      // 2. ROBUST VARIABLE EXTRACTION
      // First: Try AST map
      const targetVars = variableMap[funcName] || variableMap['<global>'];
      if (targetVars) {
          targetVars.forEach(varName => {
              const val = getValueFromScopeChain(state.scope, varName, interpreter);
              if (val !== interpreter.UNDEFINED) {
                  locals[varName] = formatValue(val, heap, interpreter);
              }
          });
      }

      // Second: Walk the scope chain manually to catch anything else (like 'var' hoisted vars)
      let currentScope = state.scope;
      while (currentScope) {
          if (currentScope.properties) {
              for (const key in currentScope.properties) {
                  if (['arguments','this','window','console','print'].includes(key)) continue;
                  if (!locals[key]) { // Don't overwrite
                      const val = currentScope.properties[key];
                      locals[key] = formatValue(val, heap, interpreter);
                  }
              }
          }
          // Stop walking up if we hit the global scope (unless this IS the global frame)
          if (currentScope === interpreter.globalScope && funcName !== 'Global Frame') break;
          currentScope = currentScope.parent;
      }

      stack.push({
        func_name: funcName,
        lineno: node.loc ? node.loc.start.line : 0,
        locals: locals
      });
    }
  }

  return {
    line_number: node.loc ? node.loc.start.line : 0,
    stack: stack, 
    heap: heap
  };
}

function formatValue(pseudoVal, heap, interpreter) {
  if (pseudoVal === undefined || pseudoVal === interpreter.UNDEFINED) return { value: 'undefined' };
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