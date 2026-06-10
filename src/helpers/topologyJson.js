import {
  DEFAULT_SPACING,
  LOCKED_EDGE_FIELD,
  TEMPORARY_POINTS_FIELD,
  getTemporaryPoints,
  isPathLocked,
  prepareTopologyForExport,
} from './pathInterpolation';
import {
  getPointRotationRadians,
  normalizePathPointRotations,
  normalizePointRotation,
} from './rotation';

export const DEFAULT_NODE_TYPES = [
  'junction',
  'charge',
  'elevator',
  'stair',
];

export function createEmptyTopology() {
  return {
    metadata: {
      scene: 'topology-editor',
      distance_threshold: DEFAULT_SPACING,
      total_topology_nodes: 0,
      total_path_points: 0,
      total_edges: 0,
    },
    topology_nodes: [],
    edges: [],
  };
}

export async function loadTopologyJson(file) {
  const text = await file.text();
  const raw = JSON.parse(text);
  return normalizeTopology(raw);
}

export function normalizeTopology(raw = {}) {
  const nodes = (raw.topology_nodes || []).map((node, index) =>
    normalizePointRotation({
      ...node,
      id: Number.isFinite(Number(node.id)) ? Number(node.id) : index,
      x: Number(node.x) || 0,
      y: Number(node.y) || 0,
      z: Number(node.z) || 0,
      type: node.type || 'waypoint',
    }, getPointRotationRadians(node, 0)),
  );

  const nodeIds = new Set(nodes.map((node) => Number(node.id)));
  const edges = (raw.edges || [])
    .map((edge) => {
      const from = Number(edge.from ?? edge.source ?? edge.start);
      const to = Number(edge.to ?? edge.target ?? edge.end);
      return {
        ...edge,
        from,
        to,
        [TEMPORARY_POINTS_FIELD]: getTemporaryPoints(edge),
        [LOCKED_EDGE_FIELD]: isPathLocked(edge),
        path_points: Array.isArray(edge.path_points)
          ? normalizePathPointRotations(
              edge.path_points.map((point, index) => ({
                ...point,
                seq: Number.isFinite(Number(point.seq)) ? Number(point.seq) : index + 1,
                x: Number(point.x) || 0,
                y: Number(point.y) || 0,
                z: Number(point.z) || 0,
              })),
            )
          : [],
      };
    })
    .filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to) && edge.from !== edge.to);

  return {
    ...raw,
    metadata: raw.metadata || {},
    topology_nodes: nodes,
    edges,
  };
}

export function getTypesFromTopology(topology) {
  const discovered = new Set(DEFAULT_NODE_TYPES);
  (topology.topology_nodes || []).forEach((node) => {
    if (node.type) discovered.add(node.type);
  });
  return Array.from(discovered);
}

export function getNextNodeId(nodes = []) {
  if (!nodes.length) return 0;
  return Math.max(...nodes.map((node) => Number(node.id) || 0)) + 1;
}

export function downloadTopologyJson(topology, spacing, fileName = 'topology.json') {
  const prepared = prepareTopologyForExport(topology, spacing);
  const blob = new Blob([JSON.stringify(prepared, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
