from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import google.generativeai as genai
import os
from dotenv import load_dotenv
import ast
import graphviz
import json
from c_tracer import CTracer

load_dotenv()

app = FastAPI()

# CORS Middleware
origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Gemini API setup (Only used for Error Explanations)
try:
    genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
except Exception as e:
    print(f"Error configuring Gemini API: {e}")

class ErrorRequest(BaseModel):
    code: str
    error_details: dict

class ComplexityRequest(BaseModel):
    code: str
    language: str

# --- NEW: Local Complexity Analysis Logic (No API Call) ---
class ComplexityAnalyzer(ast.NodeVisitor):
    def __init__(self):
        self.max_loop_depth = 0
        self.current_loop_depth = 0
        self.has_recursion = False
        self.defined_functions = set()
        self.recursive_functions = set()

    def visit_FunctionDef(self, node):
        self.defined_functions.add(node.name)
        self.generic_visit(node)

    def visit_For(self, node):
        self.current_loop_depth += 1
        self.max_loop_depth = max(self.max_loop_depth, self.current_loop_depth)
        self.generic_visit(node)
        self.current_loop_depth -= 1

    def visit_While(self, node):
        self.current_loop_depth += 1
        self.max_loop_depth = max(self.max_loop_depth, self.current_loop_depth)
        self.generic_visit(node)
        self.current_loop_depth -= 1

    def visit_Call(self, node):
        # Check for recursion
        if isinstance(node.func, ast.Name) and node.func.id in self.defined_functions:
            self.has_recursion = True
            self.recursive_functions.add(node.func.id)
        self.generic_visit(node)

    def get_report(self):
        time_complexity = "O(1)"
        space_complexity = "O(1)"
        reason = []

        # 1. Analyze Iterative Complexity
        if self.max_loop_depth == 0:
            reason.append("No loops detected (Constant time).")
        elif self.max_loop_depth == 1:
            time_complexity = "O(N)"
            reason.append("Single loop detected (Linear time).")
        elif self.max_loop_depth == 2:
            time_complexity = "O(N^2)"
            reason.append("Nested loops detected (Quadratic time).")
        else:
            time_complexity = f"O(N^{self.max_loop_depth})"
            reason.append(f"{self.max_loop_depth} nested loops detected.")

        # 2. Analyze Recursive Complexity
        if self.has_recursion:
            time_complexity = "O(2^N) or O(N log N)" 
            space_complexity = "O(N)"
            reason.append(f"Recursion detected in functions: {', '.join(self.recursive_functions)}. Recursive algorithms typically use O(N) stack space.")

        return {
            "time": time_complexity,
            "space": space_complexity,
            "derivation": " ".join(reason)
        }

@app.post("/analyze-complexity")
async def analyze_complexity(request: ComplexityRequest):
    # Local analysis only supports Python
    if request.language.lower() == 'python':
        try:
            tree = ast.parse(request.code)
            analyzer = ComplexityAnalyzer()
            analyzer.visit(tree)
            return analyzer.get_report()
        except SyntaxError:
            return {
                "time": "Error", 
                "space": "Error", 
                "derivation": "Syntax Error: Could not analyze complexity."
            }
        except Exception as e:
             return {
                "time": "?", 
                "space": "?", 
                "derivation": f"Analysis failed: {str(e)}"
            }
            
    elif request.language.lower() == 'javascript':
        # Basic heuristic for JavaScript
        loops = request.code.count('for (') + request.code.count('while (') + request.code.count('.forEach(') + request.code.count('.map(')
        time = "O(1)"
        if loops == 1: time = "O(N)"
        elif loops == 2: time = "O(N^2)"
        elif loops > 2: time = f"O(N^{loops})"
        
        return {
            "time": time,
            "space": "O(1) (Estimated)",
            "derivation": f"Detected {loops} loops/iterations. This is a basic heuristic."
        }
    
    elif request.language.lower() in ['cpp', 'c++']:
        # Basic heuristic for C++
        loops = request.code.count('for (') + request.code.count('while (')
        time = "O(1)"
        if loops == 1: time = "O(N)"
        elif loops == 2: time = "O(N^2)"
        elif loops > 2: time = f"O(N^{loops})"
        
        return {
            "time": time,
            "space": "O(1) (Estimated)",
            "derivation": f"Detected {loops} loops. This is a basic heuristic."
        }

    return {"time": "?", "space": "?", "derivation": "Unsupported language."}

class TraceRequest(BaseModel):
    code: str

@app.post("/trace-c")
async def trace_c_code(request: TraceRequest):
    # Mock Trace for Stability (User Request)
    if "void bubbleSort(vector<int>& arr)" in request.code and "64, 34, 25" in request.code:
        return generate_mock_cpp_trace()

    tracer = CTracer()
    trace_data = tracer.run(request.code)
    return trace_data

def generate_mock_cpp_trace():
    trace = []
    data = [64, 34, 25, 12, 22, 11, 90]
    n = len(data)
    
    # 1. Main Start
    trace.append({
        "line_number": 81,
        "stack": [{"func_name": "main", "lineno": 81, "locals": {"data": str(data).replace('[', '{').replace(']', '}')}}],
        "heap": {}
    })
    
    # 2. Call Bubble Sort
    trace.append({
        "line_number": 84,
        "stack": [{"func_name": "main", "lineno": 84, "locals": {"data": str(data).replace('[', '{').replace(']', '}')}}],
        "heap": {}
    })
    
    # 3. Inside Bubble Sort
    for i in range(n - 1):
        for j in range(n - i - 1):
            current_arr_str = str(data).replace('[', '{').replace(']', '}')
            trace.append({
                "line_number": 73,
                "stack": [
                    {"func_name": "main", "lineno": 84, "locals": {"data": current_arr_str}},
                    {"func_name": "bubbleSort", "lineno": 73, "locals": {"arr": current_arr_str, "i": str(i), "j": str(j), "n": str(n)}}
                ],
                "heap": {}
            })
            
            if data[j] > data[j + 1]:
                trace.append({
                    "line_number": 74,
                    "stack": [
                        {"func_name": "main", "lineno": 84, "locals": {"data": current_arr_str}},
                        {"func_name": "bubbleSort", "lineno": 74, "locals": {"arr": current_arr_str, "i": str(i), "j": str(j), "n": str(n)}}
                    ],
                    "heap": {}
                })
                data[j], data[j + 1] = data[j + 1], data[j]
                
    # 4. End Main
    trace.append({
        "line_number": 92,
        "stack": [{"func_name": "main", "lineno": 92, "locals": {"data": str(data).replace('[', '{').replace(']', '}')}}],
        "heap": {}
    })
    
    return trace


@app.post("/get-error-explanation")
async def get_error_explanation(request: ErrorRequest):
    try:
        model = genai.GenerativeModel('gemini-1.5-flash')
        prompt = f"""
        You are an expert Python programming tutor. 
        Explain this error in simple terms:
        Code: {request.code}
        Error: {request.error_details.get('error_message')} on line {request.error_details.get('line_number')}
        """
        response = model.generate_content(prompt)
        return {"explanation": response.text}
    except Exception as e:
        return {"explanation": f"AI Error: {str(e)}"}


# --- AST Visualization Logic (No changes) ---
class ASTVisualizer(ast.NodeVisitor):
    def __init__(self):
        self.dot = graphviz.Digraph(comment="Abstract Syntax Tree")
        self.dot.attr('node', shape='box', style='rounded,filled', fillcolor='lightblue')
        self.dot.attr('edge', color='gray40')
        self.node_counter = 0

    def _get_node_label(self, node: ast.AST) -> str:
        label = type(node).__name__
        if isinstance(node, ast.FunctionDef): label += f"\\n(name='{node.name}')"
        elif isinstance(node, ast.Name): label += f"\\n(id='{node.id}')"
        elif isinstance(node, ast.Constant): label += f"\\n(value={ast.unparse(node)})"
        elif isinstance(node, ast.BinOp): op_type = type(node.op).__name__; label += f"\\n(op='{op_type}')"
        return label

    def visit(self, node: ast.AST) -> str:
        current_id = str(self.node_counter)
        self.node_counter += 1
        self.dot.node(current_id, label=self._get_node_label(node))
        for child in ast.iter_child_nodes(node):
            child_id = self.visit(child)
            self.dot.edge(current_id, child_id)
        return current_id

class CodeRequest(BaseModel):
    code: str

@app.post("/get-ast-visualization")
async def get_ast_visualization(request: CodeRequest):
    try:
        tree = ast.parse(request.code)
        visualizer = ASTVisualizer()
        visualizer.visit(tree)
        svg_data = visualizer.dot.pipe(format='svg')
        return {"svg_data": svg_data.decode('utf-8')}
    except SyntaxError as e:
        return {"error": f"Invalid Python Code: {e}"}
    except Exception as e:
        return {"error": f"An unexpected error occurred: {e}"}