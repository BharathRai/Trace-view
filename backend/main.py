# backend/main.py

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import google.generativeai as genai
import os
from dotenv import load_dotenv
import ast
import graphviz
import json

load_dotenv()

app = FastAPI()

# CORS Middleware (no changes here)
origins = [
    "http://localhost:5173", 
    "http://127.0.0.1:5173",
    "https://trace-view.onrender.com"  # Add this line
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Gemini API setup (no changes here)
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

@app.post("/get-error-explanation")
async def get_error_explanation(request: ErrorRequest):
    try:
        # Corrected the model name from 2.5 to 1.5
        model = genai.GenerativeModel('models/gemini-2.5-flash')
    except Exception as e:
        return {"explanation": f"Could not initialize the AI model. Please check your API key. Error: {e}"}

    prompt = f"""
    You are an expert Python programming tutor who explains errors to beginners.
    A student ran this code:
    ```python
    {request.code}
    ```
    And got this error on line {request.error_details.get('line_number')}:
    {request.error_details.get('error_type')}: {request.error_details.get('error_message')}
    
    Explain the error in a simple, friendly tone and suggest a fix.
    """
    
    try:
        response = model.generate_content(prompt)
        
        if not response.parts:
            block_reason = response.prompt_feedback.block_reason.name
            print(f"Gemini API call was blocked. Reason: {block_reason}")
            return {"explanation": f"The request was blocked by the AI's safety filter ({block_reason}). Please modify the code and try again."}

        return {"explanation": response.text}
        
    except Exception as e:
        print(f"Gemini API call failed: {e}")
        return {"explanation": f"The AI assistant failed to process the request. Please check the backend terminal for detailed errors. Error: {e}"}

@app.post("/analyze-complexity")
async def analyze_complexity(request: ComplexityRequest):
    try:
        model = genai.GenerativeModel('gemini-2.5-flash')
        
        prompt = f"""
        Analyze the following {request.language} code and determine its Time Complexity and Space Complexity in Big O notation.
        You must also provide a detailed, step-by-step explanation of the time complexity derivation. For recursive functions, state the recurrence relation.
        Code:
        ```{request.language}
        {request.code}
        ```
        
        Respond in this EXACT JSON format (do not add markdown ticks):
        {{
            "time": "O(...)",
            "space": "O(...)",
            "reason": "Brief one-sentence explanation."
        }}
        """
        
        response = model.generate_content(prompt)
        # Clean up markdown if the AI adds it
        clean_text = response.text.replace('```json', '').replace('```', '').strip()
        return json.loads(clean_text)
        
    except Exception as e:
        print(f"Complexity Analysis failed: {e}")
        return {"time": "?", "space": "?", "reason": "Could not analyze."}

# --- AST Visualization Logic (no changes here) ---
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