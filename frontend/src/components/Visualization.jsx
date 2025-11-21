import React, { useState, useEffect } from 'react';
import ReactFlow, { MiniMap, Controls, Background, Handle, Position, MarkerType } from 'reactflow';
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
                border: data.isExecuting ? '2px solid #34d399' : '1px solid #475569',
                boxShadow: data.isExecuting ? '0 0 20px rgba(52, 211, 153, 0.4)' : 'none',
                background: data.isExecuting ? 'rgba(52, 211, 153, 0.05)' : 'rgba(30, 41, 59, 0.95)'
            }}
        >
            <div className="frame-title">{data.title}</div>
            <div className="var-grid">
                {data.variables.filter(v => !IGNORED_VARS.includes(v.name)).map(v => (
                    <React.Fragment key={v.name}>
                        <div className="var-box var-name">{v.name}</div>
                        <div className="var-box var-value">
                            <span>{v.value}</span>
                            {v.hasRef && (
                                <Handle
                                    type="source"
                                    position={Position.Right}
                                    id={v.handleId}
                                    style={{ background: '#38bdf8', width: 8, height: 8, right: -4 }}
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
        <Handle
            type="target"
            position={Position.Left}
            style={{ background: 'transparent', border: 'none' }}
        />

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

// --- Dagre Layout Function ---
const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));
const nodeWidth = 250;
const nodeHeight = 150;
const getLayoutedElements = (nodes, edges, direction = 'LR') => {
    dagreGraph.setGraph({ rankdir: direction, nodesep: 60, ranksep: 100 });
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

        nodes.push({
            id: `heap-${id}`,
            type: 'heap',
            data: { type: obj.type, items: items }
        });
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
                    animated: true,
                    style: { stroke: '#38bdf8', strokeWidth: 2 },
                    markerEnd: { type: MarkerType.ArrowClosed, color: '#38bdf8' }
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
        return (
            <div className="viz-section">
                <h2>Program Output</h2>
                <div className="viz-box" style={{ backgroundColor: '#1e293b', color: '#e2e8f0', whiteSpace: 'pre-wrap', border: '1px solid #334155' }}>
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
                nodesDraggable={false}
                panOnDrag={true}
                zoomOnScroll={true}
            >
                <MiniMap
                    nodeColor="#475569"
                    maskColor="rgba(15, 23, 42, 0.6)"
                    style={{ backgroundColor: '#1e293b', border: '1px solid #334155' }}
                />
                <Controls
                    style={{
                        background: '#1e293b',
                        border: '1px solid #334155',
                        borderRadius: '8px',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                        padding: '4px'
                    }}
                />
                <Background
                    variant="dots"
                    gap={24}
                    size={2}
                    color="#334155"
                />
            </ReactFlow>
        </div>
    );
}

export default Visualization;