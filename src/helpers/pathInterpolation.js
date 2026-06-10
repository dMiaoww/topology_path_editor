import {
  getPointRotationRadians,
  normalizePathPointRotations,
  normalizePointRotation,
  regeneratePathPointRotations,
} from './rotation';

export const DEFAULT_SPACING = 0.2;
export const TEMPORARY_POINTS_FIELD = 'temporary_points';
export const LOCKED_EDGE_FIELD = 'path_locked';

const roundCoordinate = (value) => Number(Number(value || 0).toFixed(4));

function normalizePoint(point, fallbackSeq = 1) {
  return normalizePointRotation({
    ...point,
    seq: Number.isFinite(Number(point?.seq)) ? Number(point.seq) : fallbackSeq,
    x: roundCoordinate(point?.x),
    y: roundCoordinate(point?.y),
    z: roundCoordinate(point?.z),
  }, getPointRotationRadians(point, 0));
}

export function getTemporaryPoints(edge = {}) {
  const points = edge[TEMPORARY_POINTS_FIELD] || edge.temp_points || edge._temporary_points || [];
  return Array.isArray(points)
    ? points.map((point, index) => normalizePointRotation({
        ...point,
        id: point.id || `tmp-${index + 1}`,
        x: roundCoordinate(point.x),
        y: roundCoordinate(point.y),
        z: roundCoordinate(point.z),
      }, getPointRotationRadians(point, 0)))
    : [];
}

export function isPathLocked(edge = {}) {
  return Boolean(edge[LOCKED_EDGE_FIELD] || edge.locked_path || edge._path_locked);
}

export function edgeKey(edge, index) {
  return `${edge.from}->${edge.to}#${index}`;
}

export function temporaryPointKey(edge, edgeIndex, pointIndex) {
  const point = getTemporaryPoints(edge)[pointIndex];
  return `${edgeKey(edge, edgeIndex)}::temporary::${point?.id || pointIndex}`;
}

export function getNodeMap(nodes = []) {
  return new Map(nodes.map((node) => [Number(node.id), node]));
}

function normalizeExistingPathPoints(points = [], fallbackStartSeq = 1) {
  if (!Array.isArray(points)) return [];

  return normalizePathPointRotations(
    points.map((point, index) => ({
        ...point,
        seq: Number.isFinite(Number(point?.seq)) ? Number(point.seq) : fallbackStartSeq + index,
        x: roundCoordinate(point?.x),
        y: roundCoordinate(point?.y),
        z: roundCoordinate(point?.z),
    })),
  );
}

function getMaxSeq(points = []) {
  return points.reduce((maxSeq, point) => {
    const seq = Number(point?.seq);
    return Number.isFinite(seq) ? Math.max(maxSeq, seq) : maxSeq;
  }, 0);
}

function getNextSeqAfter(points = [], fallbackNextSeq = 1) {
  const maxSeq = getMaxSeq(points);
  return Math.max(fallbackNextSeq + points.length, maxSeq + 1, 1);
}

function inferEdgeStartSeq(edge, edgeIndex, edges = []) {
  const firstSeq = Number(edge?.path_points?.[0]?.seq);
  if (Number.isFinite(firstSeq)) return firstSeq;

  const previousMaxSeq = edges
    .slice(0, edgeIndex)
    .reduce((maxSeq, currentEdge) => Math.max(maxSeq, getMaxSeq(currentEdge.path_points || [])), 0);

  if (previousMaxSeq > 0) return previousMaxSeq + 1;
  return 1;
}

function buildRegeneratedEdge(edge, nodesById, spacing, startSeq) {
  const fromNode = nodesById.get(Number(edge.from));
  const toNode = nodesById.get(Number(edge.to));
  const temporaryPoints = getTemporaryPoints(edge);
  const pathPoints = interpolatePolylinePathPoints([fromNode, ...temporaryPoints, toNode], spacing, startSeq);

  return {
    ...edge,
    from: Number(edge.from),
    to: Number(edge.to),
    [TEMPORARY_POINTS_FIELD]: temporaryPoints,
    [LOCKED_EDGE_FIELD]: isPathLocked(edge),
    path_points: pathPoints,
  };
}

function normalizeEdgeForEditor(edge, fallbackStartSeq = 1) {
  return {
    ...edge,
    from: Number(edge.from),
    to: Number(edge.to),
    [TEMPORARY_POINTS_FIELD]: getTemporaryPoints(edge),
    [LOCKED_EDGE_FIELD]: isPathLocked(edge),
    path_points: normalizeExistingPathPoints(edge.path_points || [], fallbackStartSeq),
  };
}

export function interpolatePathPoints(fromNode, toNode, spacing = DEFAULT_SPACING, startSeq = 1) {
  if (!fromNode || !toNode) return [];

  const safeSpacing = Math.max(Number(spacing) || DEFAULT_SPACING, 0.01);
  const start = {
    x: Number(fromNode.x) || 0,
    y: Number(fromNode.y) || 0,
    z: Number(fromNode.z) || 0,
  };
  const end = {
    x: Number(toNode.x) || 0,
    y: Number(toNode.y) || 0,
    z: Number(toNode.z) || 0,
  };
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const distance = Math.hypot(dx, dy, dz);

  if (distance === 0) {
    return regeneratePathPointRotations([
      { seq: startSeq, x: roundCoordinate(start.x), y: roundCoordinate(start.y), z: roundCoordinate(start.z) },
    ]);
  }

  const segments = Math.max(1, Math.ceil(distance / safeSpacing));
  return regeneratePathPointRotations(Array.from({ length: segments + 1 }, (_, index) => {
    const t = index / segments;
    return {
      seq: startSeq + index,
      x: roundCoordinate(start.x + dx * t),
      y: roundCoordinate(start.y + dy * t),
      z: roundCoordinate(start.z + dz * t),
    };
  }));
}

export function interpolatePolylinePathPoints(points = [], spacing = DEFAULT_SPACING, startSeq = 1) {
  const waypoints = points.filter(Boolean);
  if (!waypoints.length) return [];
  if (waypoints.length === 1) return [normalizePoint(waypoints[0], startSeq)];

  const pathPoints = [];
  let seq = startSeq;

  for (let index = 0; index < waypoints.length - 1; index += 1) {
    const segment = interpolatePathPoints(waypoints[index], waypoints[index + 1], spacing, seq);
    const segmentPoints = index === 0 ? segment : segment.slice(1);

    segmentPoints.forEach((point) => {
      pathPoints.push({ ...point, seq });
      seq += 1;
    });
  }

  return regeneratePathPointRotations(pathPoints);
}

export function regenerateAllPaths(topology, spacing = DEFAULT_SPACING, options = {}) {
  const nodes = topology.topology_nodes || [];
  const nodesById = getNodeMap(nodes);
  let seq = 1;

  const edges = (topology.edges || []).map((edge) => {
    if (isPathLocked(edge) && !options.includeLocked) {
      const preservedEdge = normalizeEdgeForEditor(edge, seq);
      seq = getNextSeqAfter(preservedEdge.path_points, seq);
      return preservedEdge;
    }

    const nextEdge = buildRegeneratedEdge(edge, nodesById, spacing, seq);
    seq += nextEdge.path_points.length;
    return nextEdge;
  });

  return {
    ...topology,
    edges,
    metadata: updateMetadata(topology.metadata, nodes.length, edges, spacing),
  };
}

export function regenerateAffectedPaths(topology, spacing = DEFAULT_SPACING, affectedEdgeIndexes = [], options = {}) {
  const nodes = topology.topology_nodes || [];
  const nodesById = getNodeMap(nodes);
  const affectedIndexes = affectedEdgeIndexes instanceof Set
    ? affectedEdgeIndexes
    : new Set(affectedEdgeIndexes);

  const edges = (topology.edges || []).map((edge, index, allEdges) => {
    const shouldRegenerate = affectedIndexes.has(index) && (!isPathLocked(edge) || options.includeLocked);
    if (!shouldRegenerate) {
      return normalizeEdgeForEditor(edge, inferEdgeStartSeq(edge, index, allEdges));
    }

    return buildRegeneratedEdge(edge, nodesById, spacing, inferEdgeStartSeq(edge, index, allEdges));
  });

  return {
    ...topology,
    edges,
    metadata: updateMetadata(topology.metadata, nodes.length, edges, spacing),
  };
}

export function refreshTopologyMetadata(topology, spacing = DEFAULT_SPACING) {
  const edges = (topology.edges || []).map((edge, index, allEdges) =>
    normalizeEdgeForEditor(edge, inferEdgeStartSeq(edge, index, allEdges)),
  );

  return {
    ...topology,
    edges,
    metadata: updateMetadata(topology.metadata, topology.topology_nodes?.length || 0, edges, spacing),
  };
}

export function ensurePathPoints(topology, spacing = DEFAULT_SPACING) {
  const nodes = topology.topology_nodes || [];
  const nodesById = getNodeMap(nodes);
  let seq = 1;

  const edges = (topology.edges || []).map((edge) => {
    const existing = Array.isArray(edge.path_points) ? edge.path_points : [];
    const temporaryPoints = getTemporaryPoints(edge);
    const pathPoints = existing.length
      ? normalizeExistingPathPoints(existing, seq)
      : interpolatePolylinePathPoints(
          [nodesById.get(Number(edge.from)), ...temporaryPoints, nodesById.get(Number(edge.to))],
          spacing,
          seq,
        );

    seq = getNextSeqAfter(pathPoints, seq);

    return {
      ...edge,
      from: Number(edge.from),
      to: Number(edge.to),
      [TEMPORARY_POINTS_FIELD]: temporaryPoints,
      [LOCKED_EDGE_FIELD]: isPathLocked(edge),
      path_points: pathPoints,
    };
  });

  return {
    ...topology,
    edges,
    metadata: updateMetadata(topology.metadata, nodes.length, edges, spacing),
  };
}

export function resequencePathPoints(topology, spacing = DEFAULT_SPACING) {
  let seq = 1;
  const edges = (topology.edges || []).map((edge) => {
    const pathPoints = normalizePathPointRotations(
      (edge.path_points || []).map((point) => ({
        ...point,
        seq: seq++,
        x: roundCoordinate(point.x),
        y: roundCoordinate(point.y),
        z: roundCoordinate(point.z),
      })),
    );
    return {
      ...edge,
      [TEMPORARY_POINTS_FIELD]: getTemporaryPoints(edge),
      [LOCKED_EDGE_FIELD]: isPathLocked(edge),
      path_points: pathPoints,
    };
  });

  return {
    ...topology,
    edges,
    metadata: updateMetadata(topology.metadata, topology.topology_nodes?.length || 0, edges, spacing),
  };
}

export function updateMetadata(metadata = {}, nodeCount = 0, edges = [], spacing = DEFAULT_SPACING) {
  const totalPathPoints = edges.reduce((sum, edge) => sum + (edge.path_points?.length || 0), 0);
  return {
    ...metadata,
    distance_threshold: Number(spacing),
    total_topology_nodes: nodeCount,
    total_edges: edges.length,
    total_path_points: totalPathPoints,
  };
}

export function prepareTopologyForExport(topology, spacing = DEFAULT_SPACING) {
  const normalized = refreshTopologyMetadata(topology, spacing);
  return {
    ...normalized,
    topology_nodes: (normalized.topology_nodes || []).map((node) => {
      const rotation = normalizePointRotation(node, getPointRotationRadians(node, 0));
      return {
        ...node,
        id: Number(node.id),
        x: roundCoordinate(node.x),
        y: roundCoordinate(node.y),
        z: roundCoordinate(node.z),
        angle: rotation.angle,
        radian: rotation.radian,
        quaternion: rotation.quaternion,
        type: node.type || 'waypoint',
      };
    }),
    edges: (normalized.edges || []).map((edge) => {
      const {
        temporary_points: _temporaryPoints,
        temp_points: _legacyTempPoints,
        _temporary_points: _privateTemporaryPoints,
        path_locked: _pathLocked,
        locked_path: _legacyPathLocked,
        _path_locked: _privatePathLocked,
        ...exportableEdge
      } = edge;

      return {
        ...exportableEdge,
        from: Number(edge.from),
        to: Number(edge.to),
        path_points: (edge.path_points || []).map((point, index) => {
          const rotation = normalizePointRotation(point, getPointRotationRadians(point, 0));
          return {
            seq: Number.isFinite(Number(point.seq)) ? Number(point.seq) : index + 1,
            x: roundCoordinate(point.x),
            y: roundCoordinate(point.y),
            z: roundCoordinate(point.z),
            angle: rotation.angle,
            radian: rotation.radian,
            quaternion: rotation.quaternion,
          };
        }),
      };
    }),
  };
}
