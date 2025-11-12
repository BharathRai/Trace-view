import React, { useState, useEffect } from 'react'; // <-- ADD 'React' HERE
import ReactFlow, { MiniMap, Controls, Background, Handle, Position } from 'reactflow';
import 'reactflow/dist/style.css';
import ReactMarkdown from 'react-markdown';
import dagre from 'dagre';

// --- Helper Components ---
const FrameNode = ({ data }) => {
    const IGNORED_VARS = ['__builtins__', 'tracer', 'user_code', 'run_user_code', 'trace_json'];
    
    return (
        <div 
            className="frame-node" 
            style={{ 
                border: data.isExecuting ? '2px solid #34d399' : '1px solid #777', 
                boxShadow: data.isExecuting ? '0 0 10px #34d399' : 'none' 
            }}
        >
            <div className="frame-title">{data.title}</div>
            <div className="var-grid">
                {data.variables.filter(v => !IGNORED_VARS.includes(v.name)).map(v => (
                    <React.Fragment key={v.name}> {/* This line needs 'React' to be defined */}
                        <div className="var-box var-name">{v.name}</div>
                        <div className="var-box var-value">
                            <span>{v.value}</span>
                            {v.hasRef && (
                                <Handle
                                    type="source"
                                    position={Position.Right}
                                    id={v.handleId}
                                    style={{ background: '#00BFFF', width: 10, height: 10, right: -6 }}
                                />
                            )}
                        </div>
                    </React.Fragment>
                ))}
            </div>
        </div>
    );
};
const HeapNode = ({ data }) => (
    <div className="heap-node">
        <div className="heap-title">{data.type}</div>
        <div className="heap-grid">
            {data.items.map((item, index) => (
                <div key={index} className="heap-item">
                    <div className="heap-item-index">{index}</div>
                    <div>{item.value}</div>
                </div>
            ))}
        </div>
    </div>
);
const nodeTypes = { frame: FrameNode, heap: HeapNode };


// --- Dagre Layout Function (No changes) ---
const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));
const nodeWidth = 250;
const nodeHeight = 150;
const getLayoutedElements = (nodes, edges, direction = 'LR') => {
  dagreGraph.setGraph({ rankdir: direction, nodesep: 20, ranksep: 50 });
  nodes.forEach((node) => { dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight }); });
  edges.forEach((edge) => { dagreGraph.setEdge(edge.source, edge.target); });
  dagre.layout(dagreGraph);
  nodes.forEach((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    node.position = {
      x: nodeWithPosition.x - nodeWidth / 2,
      y: nodeWithPosition.y - nodeHeight / 2,
    };
  });
  return { nodes, edges };
};


// --- Main Data Processing Function ---
const generateFlowElements = (traceStep) => {
    if (!traceStep || !traceStep.stack) return { nodes: [], edges: [] };
    let nodes = [];
    let edges = [];
    const { stack, heap, line_number } = traceStep;

    Object.entries(heap).forEach(([id, obj], index) => {
        const isList = obj.type === 'list' || obj.type === 'tuple';
        let items = isList ? obj.value.map(v => ({ value: v.value ?? '→' })) : [];
        nodes.push({ id: `heap-${id}`, type: 'heap', data: { type: obj.type, items: items } });
    });

    stack.forEach((frame, frameIndex) => {
        const frameId = `frame-${frameIndex}`;
        const variables = Object.entries(frame.locals).map(([name, data]) => ({
            name: name,
            value: data.value ?? '→',
            hasRef: !!data.ref,
            handleId: `handle-${frameId}-${name}`
        }));
        nodes.push({
            id: frameId, type: 'frame',
            data: {
                title: frame.func_name === '<module>' ? 'Global Frame' : frame.func_name,
                variables: variables,
                isExecuting: frame.lineno === line_number && frame.func_name !== '<module>'
            }
        });
        Object.entries(frame.locals).forEach(([name, data]) => {
            if (data.ref) {
                const handleId = `handle-${frameId}-${name}`;
                edges.push({
                    id: `edge-${frameId}-${name}`, source: frameId, sourceHandle: handleId,
                    target: `heap-${data.ref}`, type: 'smoothstep',
                    
                    // --- 2. Make pointers animated and styled ---
                    animated: true,
                    style: { stroke: '#00BFFF' },
                    markerEnd: { type: MarkerType.ArrowClosed, color: '#00BFFF' }
                });
            }
        });
    });
    return getLayoutedElements(nodes, edges);
};


// --- Main Visualization Component ---
function Visualization({ traceStep, error }) {
    const [elements, setElements] = useState({ nodes: [], edges: [] });

    useEffect(() => {
        if (traceStep && traceStep.stack) {
            setElements(generateFlowElements(traceStep));
        } else if (!error) {
            setElements({ nodes: [], edges: [] });
        }
    }, [traceStep, error]);

    if (error) {
        // ... (Error display remains the same)
        return (
            <div className="error-container">
                <h2 className="error-title">🚨 An Error Occurred!</h2>
                <p className="error-details">{error.details || error.error_message}</p>
                <div className="ai-hint-divider" />
                <div>
                    <h3 className="ai-hint-title">💡 AI Assistant</h3>
                    <ReactMarkdown>{error.aiHint || 'Thinking...'}</ReactMarkdown>
                </div>
            </div>
        );
    }

    if (traceStep && traceStep.event === 'output') {
        // ... (Output display remains the same)
        return (
            <div className="viz-section">
                <h2>Program Output</h2>
                <div className="viz-box" style={{backgroundColor: '#111', color: '#eee', whiteSpace: 'pre-wrap'}}>
                    {traceStep.data}
                </div>
            </div>
        );
    }
    
    return (
        <div style={{ height: '100%', width: '100%' }}>
            <ReactFlow 
                nodes={elements.nodes} 
                edges={elements.edges} 
                nodeTypes={nodeTypes} 
                fitView
                // --- 3. Polish the interaction ---
                nodesDraggable={false} // Nodes are locked in place
                panOnDrag={true}
                zoomOnScroll={true}
            >
                {/* --- 4. Style the MiniMap and Controls --- */}
                <MiniMap 
                    nodeColor="#34d399" // Use the same green as the highlight
                    maskColor="#111827"
                    style={{ backgroundColor: '#1f2937' }}
                />
                <Controls 
                    style={{ 
                        background: '#1f2937', 
                        border: '1px solid #374151', 
                        button: { color: '#eee', border: 'none' } 
                    }} 
                />
                <Background 
                    variant="lines" // Change from 'dots' to 'lines'
                    gap={20}        // Space between lines
                    size={1}        // Thickness of lines
                    color="#444"   // Color of the lines
                />
            </ReactFlow>
        </div>
    );
}

export default Visualization;