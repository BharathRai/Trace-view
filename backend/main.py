from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import google.generativeai as genai
import os
from dotenv import load_dotenv
import ast
import graphviz

load_dotenv()

app = FastAPI()

# CORS Middleware
origins = [
    "http://localhost:5173", 
    "http://127.0.0.1:5173",
    "https://trace-view.onrender.com", # Your current frontend
    "https://trace-view-26zk.onrender.com"
]

app.add_middleware(
    CORSMiddleware,
    # CHANGE: Allow all origins temporarily to fix the issue
    allow_origins=["*"], 
    allow_credentials=True,
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

# --- NEW: Smart Algorithmic Complexity Analyzer ---
class ComplexityAnalyzer(ast.NodeVisitor):
    def __init__(self):
        self.complexity = "O(1)"
        self.reason = "Constant time operations."
        self.loops = 0
        self.nested_loops = 0
        self.recursion_found = False
        self.recursion_count = 0
        self.recursive_funcs = set()
        self.func_names = set()
        self.recursion_type = None # 'linear' (n-1) or 'log' (n/2)
        self.has_loop_in_recursion = False

    def visit_FunctionDef(self, node):
        self.func_names.add(node.name)
        self.generic_visit(node)

    def visit_For(self, node):
        self.loops += 1
        # Check nesting
        for child in ast.walk(node):
            if isinstance(child, (ast.For, ast.While)) and child != node:
                self.nested_loops = max(self.nested_loops, 2)
        
        if self.recursion_found: 
             self.has_loop_in_recursion = True
        self.generic_visit(node)

    def visit_While(self, node):
        self.loops += 1
        # Check nesting
        for child in ast.walk(node):
            if isinstance(child, (ast.For, ast.While)) and child != node:
                self.nested_loops = max(self.nested_loops, 2)
        
        if self.recursion_found:
             self.has_loop_in_recursion = True
        self.generic_visit(node)

    def visit_Call(self, node):
        if isinstance(node.func, ast.Name) and node.func.id in self.func_names:
            self.recursion_found = True
            self.recursion_count += 1
            self.recursive_funcs.add(node.func.id)
            
            # --- KEY LOGIC: Detect Recursion Pattern ---
            # Check arguments to see if we are dividing (Merge Sort) or subtracting (Fibonacci)
            for arg in node.args:
                # Look for Division (mid // 2) or Slicing (arr[:mid]) -> Implies O(log N)
                if isinstance(arg, ast.BinOp) and isinstance(arg.op, (ast.Div, ast.FloorDiv)):
                    self.recursion_type = 'log'
                elif isinstance(arg, ast.Subscript): # Slicing often means dividing input
                    self.recursion_type = 'log'
                
        self.generic_visit(node)

    def get_report(self):
        time_complexity = "O(1)"
        space_complexity = "O(1)"
        reason = []

        # 1. Analyze Recursive Patterns (Priority)
        if self.recursion_found:
            # CASE A: Linearithmic (Merge Sort)
            if self.recursion_type == 'log' and (self.loops > 0 or self.has_loop_in_recursion):
                time_complexity = "O(N log N)"
                space_complexity = "O(N)"
                reason.append("Detected 'Divide and Conquer' recursion (splitting input) combined with iterative processing (loops). This structure typically results in N log N complexity.")
            
            # CASE B: Logarithmic (Binary Search)
            elif self.recursion_type == 'log':
                time_complexity = "O(log N)"
                space_complexity = "O(log N)"
                reason.append("Detected recursive division of input without full iteration. This implies Logarithmic time.")

            # CASE C: Exponential (Fibonacci)
            elif self.recursion_count >= 2:
                time_complexity = "O(2^N)"
                space_complexity = "O(N)"
                reason.append(f"Detected multiple recursive calls ({self.recursion_count}) per step. This 'branching' recursion typically results in Exponential time.")
            
            # CASE D: Linear Recursion
            else:
                time_complexity = "O(N)"
                space_complexity = "O(N)"
                reason.append("Detected simple linear recursion (depth correlates to input size).")

        # 2. Analyze Iterative Patterns
        elif self.nested_loops >= 2:
            time_complexity = "O(N^2)"
            space_complexity = "O(1)"
            reason.append("Detected nested loops. This results in Quadratic time complexity.")
        elif self.loops > 0:
            time_complexity = "O(N)"
            space_complexity = "O(1)"
            reason.append("Detected a single loop iterating over input. This results in Linear time complexity.")

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
        return {
            "time": "Unknown",
            "space": "Unknown",
            "derivation": "Local complexity analysis is currently only supported for Python code."
        }
    
    return {"time": "?", "space": "?", "derivation": "Unsupported language."}


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
        return label

    def visit(self, node: ast.AST) -> str:
        current_id = str(self.node_counter)
        self.node_counter += 1
        self.dot.node(current_id, label=self._get_node_label(node))
        for child in ast.iter_child_nodes(node):
            child_id = self.visit(child)
            self.dot.edge(current_id, child_id)
        return current_id

@app.post("/get-ast-visualization")
async def get_ast_visualization(request: CodeRequest):
    try:
        tree = ast.parse(request.code)
        visualizer = ASTVisualizer()
        visualizer.visit(tree)
        svg_data = visualizer.dot.pipe(format='svg')
        return {"svg_data": svg_data.decode('utf-8')}
    except Exception as e:
        return {"error": f"An unexpected error occurred: {e}"}