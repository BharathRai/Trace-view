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

    // 1. Parse the AST to find variable names per function
    const variableMap = buildVariableMap(code);

    const myInterpreter = new window.Interpreter(code, initFunc);

    while (myInterpreter.step() && stepCount < MAX_STEPS) {
      stepCount++;
      
      if (myInterpreter.stateStack.length === 0) break;

      const node = myInterpreter.stateStack[myInterpreter.stateStack.length - 1].node;
      
      if (node && node.start && node.end && (
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

// --- HELPER: Build a map of Function Name -> [Variable Names] ---
function buildVariableMap(code) {
    const map = { '<global>': new Set() };
    
    try {
        const ast = window.acorn.parse(code, { ecmaVersion: 2020 });
        
        const visit = (node, scopeName) => {
            if (!node) return;

            if (node.type === 'FunctionDeclaration' && node.id) {
                const funcName = node.id.name;
                map[funcName] = new Set();
                if (node.params) {
                    node.params.forEach(p => {
                        if (p.name) map[funcName].add(p.name);
                    });
                }
                
                // Recurse into function body with new scope name
                visit(node.body, funcName);
                return; 
            } 
            else if (node.type === 'VariableDeclaration') {
                node.declarations.forEach(dec => {
                    if (dec.id && dec.id.name) {
                        // Ensure the scopeName exists in the map
                        if (!map[scopeName]) map[scopeName] = new Set();
                        map[scopeName].add(dec.id.name);
                    }
                });
            }

            // Generic walker for children
            for (const key in node) {
                if (key === 'body' && node.type === 'FunctionDeclaration') continue;

                if (node[key] && typeof node[key] === 'object') {
                    if (Array.isArray(node[key])) {
                        node[key].forEach(child => visit(child, scopeName));
                    } else if (node[key].type) {
                        visit(node[key], scopeName);
                    }
                }
            }
        };

        visit(ast, '<global>');
    } catch (e) {
        console.warn("Failed to parse AST:", e);
    }
    return map;
}

// --- HELPER: Manually walk scope chain to find a variable ---
function getValueFromScope(scope, name, interpreter) {
    let currentScope = scope;
    while (currentScope) {
        // Safe property check
        if (currentScope.properties && Object.prototype.hasOwnProperty.call(currentScope.properties, name)) {
            return currentScope.properties[name];
        }
        
        if (currentScope === interpreter.globalScope) {
             break;
        }
        currentScope = currentScope.parent;
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

      let funcName = state.func_.name || 'anonymous';
      if (i === 0 && funcName === 'anonymous') funcName = 'Global Frame';

      const locals = {};
      
      // 1. Targeted Extraction using AST Map
      const targetVars = variableMap[funcName] || variableMap['<global>'];
      if (targetVars) {
          targetVars.forEach(varName => {
              const val = getValueFromScope(state.scope, varName, interpreter);
              if (val !== interpreter.UNDEFINED) {
                  locals[varName] = formatValue(val, heap, interpreter);
              }
          });
      }

      // 2. Fallback Extraction
      if (state.scope.properties) {
           for (const key in state.scope.properties) {
              if (key === 'arguments' || key === 'this' || key === 'window' || key === 'console' || key === 'print') continue;
              if (!locals[key]) {
                  const val = state.scope.properties[key];
                  locals[key] = formatValue(val, heap, interpreter);
              }
           }
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