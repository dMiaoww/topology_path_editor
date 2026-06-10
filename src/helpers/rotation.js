const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function roundValue(value, precision = 6) {
  return Number(toFiniteNumber(value).toFixed(precision));
}

function readQuaternion(value) {
  if (Array.isArray(value)) {
    return [0, 1, 2, 3].map((index) => toFiniteNumber(value[index], index === 3 ? 1 : 0));
  }
  if (value && typeof value === 'object') {
    return [
      toFiniteNumber(value.x),
      toFiniteNumber(value.y),
      toFiniteNumber(value.z),
      toFiniteNumber(value.w, 1),
    ];
  }
  return null;
}

export function degreesToRadians(degrees) {
  return toFiniteNumber(degrees) * DEG_TO_RAD;
}

export function radiansToDegrees(radians) {
  return toFiniteNumber(radians) * RAD_TO_DEG;
}

export function quaternionFromRadians(radians) {
  const half = toFiniteNumber(radians) / 2;
  return [
    0,
    0,
    roundValue(Math.sin(half), 6),
    roundValue(Math.cos(half), 6),
  ];
}

export function radiansFromQuaternion(value, fallbackRadians = 0) {
  const quaternion = readQuaternion(value);
  if (!quaternion) return fallbackRadians;
  const [x, y, z, w] = quaternion;
  const sinyCosp = 2 * (w * z + x * y);
  const cosyCosp = 1 - 2 * (y * y + z * z);
  const radians = Math.atan2(sinyCosp, cosyCosp);
  return Number.isFinite(radians) ? radians : fallbackRadians;
}

export function hasPointRotation(point = {}) {
  return (
    Number.isFinite(Number(point.radian)) ||
    Number.isFinite(Number(point.angle)) ||
    Number.isFinite(Number(point.rotation_radians)) ||
    Number.isFinite(Number(point.rotation_degrees)) ||
    Boolean(readQuaternion(point.quaternion || point.quat || point.orientation))
  );
}

export function getPointRotationRadians(point = {}, fallbackRadians = 0) {
  if (Number.isFinite(Number(point.radian))) return Number(point.radian);
  if (Number.isFinite(Number(point.rotation_radians))) return Number(point.rotation_radians);
  if (Number.isFinite(Number(point.angle))) return degreesToRadians(point.angle);
  if (Number.isFinite(Number(point.rotation_degrees))) return degreesToRadians(point.rotation_degrees);
  return radiansFromQuaternion(point.quaternion || point.quat || point.orientation, fallbackRadians);
}

export function createRotationFieldsFromRadians(radians) {
  const safeRadians = toFiniteNumber(radians);
  return {
    angle: roundValue(radiansToDegrees(safeRadians), 4),
    radian: roundValue(safeRadians, 6),
    quaternion: quaternionFromRadians(safeRadians),
  };
}

export function createRotationFieldsFromQuaternion(quaternion, fallbackRadians = 0) {
  return createRotationFieldsFromRadians(radiansFromQuaternion(quaternion, fallbackRadians));
}

export function syncRotationFields(point = {}, source, value) {
  const fallbackRadians = getPointRotationRadians(point, 0);
  let fields;

  if (source === 'angle') {
    fields = createRotationFieldsFromRadians(degreesToRadians(value));
  } else if (source === 'radian') {
    fields = createRotationFieldsFromRadians(value);
  } else if (source === 'quaternion') {
    fields = createRotationFieldsFromQuaternion(value, fallbackRadians);
  } else {
    fields = createRotationFieldsFromRadians(fallbackRadians);
  }

  return {
    ...point,
    ...fields,
  };
}

export function normalizePointRotation(point = {}, fallbackRadians = 0) {
  const radians = hasPointRotation(point)
    ? getPointRotationRadians(point, fallbackRadians)
    : fallbackRadians;
  return syncRotationFields(point, 'radian', radians);
}

export function getYawBetweenPoints(first, second, fallbackRadians = 0) {
  const dx = toFiniteNumber(second?.x) - toFiniteNumber(first?.x);
  const dy = toFiniteNumber(second?.y) - toFiniteNumber(first?.y);
  if (Math.hypot(dx, dy) < 0.000001) return fallbackRadians;
  return Math.atan2(dy, dx);
}

export function getAutomaticPointYaw(points = [], index = 0, fallbackRadians = 0) {
  const point = points[index];
  const next = points[index + 1];
  const previous = points[index - 1];
  if (point && next) return getYawBetweenPoints(point, next, fallbackRadians);
  if (previous && point) return getYawBetweenPoints(previous, point, fallbackRadians);
  return fallbackRadians;
}

export function normalizePathPointRotations(points = []) {
  let fallbackRadians = 0;
  return points.map((point, index) => {
    const automaticYaw = getAutomaticPointYaw(points, index, fallbackRadians);
    const radians = hasPointRotation(point)
      ? getPointRotationRadians(point, automaticYaw)
      : automaticYaw;
    fallbackRadians = radians;
    return normalizePointRotation(point, radians);
  });
}

export function regeneratePathPointRotations(points = []) {
  let fallbackRadians = 0;
  return points.map((point, index) => {
    const radians = getAutomaticPointYaw(points, index, fallbackRadians);
    fallbackRadians = radians;
    return syncRotationFields(point, 'radian', radians);
  });
}
