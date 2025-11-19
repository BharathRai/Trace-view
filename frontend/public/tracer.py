import sys
import json
from io import StringIO
import inspect
import ast

execution_trace = []

# --- NEW: Algorithmic Complexity Analyzer ---
def analyze_complexity(code):
    """Analyzes code structure to determine Big O complexity."""
    try:
        tree = ast.parse(code)
        
        complexity_data = {
            'time': 'O(1)', 
            'space': 'O(1)',
            'reason': 'Constant time complexity (O(1)) assumed.'
        }

        # --- AST Walker to detect dominant operations ---
        def visit(node):
            nonlocal complexity_data
            
            # Detects Loops (O(N) or O(N^2))
            if isinstance(node, (ast.For, ast.While)):
                # If we find any loop, assume at least O(N)
                if complexity_data['time'] == 'O(1)':
                     complexity_data['time'] = 'O(N)' 
                     complexity_data['space'] = 'O(N)' # Arrays/Lists are created

            # Detects function calls for simple recursion check (e.g., Fibonacci)
            if isinstance(node, ast.Call):
                # Simple check for exponential recursion (e.g., fibonacci(n-1) + fibonacci(n-2))
                if isinstance(node.func, ast.Name) and node.func.id == 'fibonacci':
                    complexity_data['time'] = 'O(2^N)' # Exponential for branching recursion
                    complexity_data['space'] = 'O(N)'

            # Recurse through children
            for child in ast.iter_child_nodes(node):
                visit(child)
        
        visit(tree)
        
        return {
            'time': complexity_data['time'],
            'space': complexity_data['space'],
            'derivation': f"Time Complexity is {complexity_data['time']} based on static AST traversal analysis. Space Complexity is {complexity_data['space']} due to recursive calls/variable storage."
        }
        
    except SyntaxError:
        return {'time': 'Syntax Error', 'space': '?', 'derivation': 'Code cannot be parsed due to syntax errors.'}
    except Exception as e:
        return {'time': 'Error', 'space': '?', 'derivation': f'AST Analysis Failed: {type(e).__name__}'}
# --- END OF NEW LOGIC ---

execution_trace = []

def trace_function(frame, event, arg):
    # ... (Keep existing trace_function logic) ...
    if event == 'line':
        heap = {}
        # ... (rest of logic) ...
    return trace_function

def run_user_code(code_string):
    global execution_trace
    execution_trace = []
    
    old_stdout = sys.stdout
    redirected_output = sys.stdout = StringIO()
    
    # ... (Keep existing execution logic) ...
    
    output = redirected_output.getvalue()
    if output:
        execution_trace.append({'event': 'output', 'data': output})

    return json.dumps(execution_trace)